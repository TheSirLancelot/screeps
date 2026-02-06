var config = require("config");
var creepCalculator = require("creep.calculator");
var remoteManager = require("remote.manager");

const CRITICAL_CREEPS = config.CRITICAL_CREEPS;
const MIN_HAULERS = config.MIN_HAULERS;

function buildMinerBody() {
    // Efficient dedicated miner: 5 WORK yields 10 energy/tick (exactly drains a source in ~300 ticks)
    return [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE];
}

function buildHaulerBody(room, creepCount) {
    // Haulers with 1 WORK + 10 CARRY + 10 MOVE = 1100 energy
    // This allows frequent spawning and keeps miners from backing up
    // The WORK allows them to repair roads while moving
    const energyAvailable = room.energyAvailable;
    const config = require("config");

    // Target body: 1 WORK + 10 CARRY + 10 MOVE
    const targetWork = 1;
    const targetCarry = 10;
    const targetMove = 10;
    const targetCost =
        targetWork * BODYPART_COST[WORK] +
        (targetCarry + targetMove) * BODYPART_COST[CARRY]; // 1100 energy

    if (energyAvailable >= targetCost) {
        // Build target body
        const body = [];
        body.push(WORK);
        for (let i = 0; i < targetCarry; i += 1) {
            body.push(CARRY);
        }
        for (let i = 0; i < targetMove; i += 1) {
            body.push(MOVE);
        }
        return body;
    } else {
        // Not enough energy - wait for full energy
        // Emergency situations are handled by emergency harvesters
        return null;
    }
}

function buildGenericCreepBody(room, creepCount) {
    // Generic body for builder/upgrader/repairer - smaller bodies that spawn faster
    // Fixed: 3 WORK + 2 CARRY + 2 MOVE = 350 energy
    const targetBody = [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    const targetCost = 350;
    const config = require("config");

    const energyAvailable = room.energyAvailable;

    if (energyAvailable >= targetCost) {
        return targetBody;
    } else if (
        creepCount <
            config.getMinCreeps(room.controller ? room.controller.level : 0) &&
        energyAvailable >= 200
    ) {
        // Only spawn smaller body if below MIN_CREEPS (emergency)
        // Minimal: 1 WORK + 1 CARRY + 1 MOVE = 200E
        return [WORK, CARRY, MOVE];
    } else {
        // Wait for full energy
        return null;
    }
}

function buildEmergencyHarvesterBody(energyAvailable) {
    const maxEnergy = Math.min(energyAvailable, 550);
    const baseCost =
        BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE]; // 200
    if (maxEnergy < baseCost) {
        return null;
    }

    let workCount = 1;
    let carryCount = 1;
    let moveCount = 1;
    let cost = baseCost;

    while (cost + BODYPART_COST[CARRY] + BODYPART_COST[MOVE] <= maxEnergy) {
        carryCount += 1;
        moveCount += 1;
        cost += BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
    }

    if (cost + BODYPART_COST[CARRY] <= maxEnergy) {
        carryCount += 1;
        cost += BODYPART_COST[CARRY];
    }

    const body = [WORK];
    for (let i = 0; i < carryCount; i += 1) {
        body.push(CARRY);
    }
    for (let i = 0; i < moveCount; i += 1) {
        body.push(MOVE);
    }
    return body;
}

var spawner = {
    /**
     * Build a spawn queue based on current room state
     * Queue is rebuilt each tick and auto-cleans stale entries
     */
    buildSpawnQueue: function (creepCount, calculatedMin, room) {
        const queue = [];
        const config = require("config");

        // Priority 1: Miners (1 per source)
        const sources = room.find(FIND_SOURCES);
        const minersBySource = {};
        for (const source of sources) {
            minersBySource[source.id] = 0;
        }
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.room === room && creep.memory.role === "miner") {
                const sid = creep.memory.sourceId;
                if (sid && minersBySource[sid] !== undefined) {
                    minersBySource[sid] += 1;
                }
            }
        }

        for (const source of sources) {
            if ((minersBySource[source.id] || 0) === 0) {
                queue.push({
                    priority: 1,
                    type: "miner",
                    sourceId: source.id,
                    validate: () => {
                        // Re-check: still no miner for this source?
                        const current = Object.values(Game.creeps).filter(
                            (c) =>
                                c.room.name === room.name &&
                                c.memory.role === "miner" &&
                                c.memory.sourceId === source.id,
                        ).length;
                        return current === 0;
                    },
                    build: () => buildMinerBody(),
                });
            }
        }

        // Priority 1.5: Maintain harvester population (only in early game)
        // In early game, harvesters are essential for energy generation
        // Once RCL >= 3, transition to miners instead
        const roomLevel = room.controller ? room.controller.level : 0;
        if (roomLevel < 3) {
            const harvesters = Object.values(Game.creeps).filter(
                (c) =>
                    c.room.name === room.name && c.memory.role === "harvester",
            ).length;
            const minHarvesters = config.MIN_HARVESTERS || 2;
            if (harvesters < minHarvesters) {
                for (let i = harvesters; i < minHarvesters; i += 1) {
                    queue.push({
                        priority: 1.5,
                        type: "harvester",
                        validate: () => {
                            const current = Object.values(Game.creeps).filter(
                                (c) =>
                                    c.room.name === room.name &&
                                    c.memory.role === "harvester",
                            ).length;
                            return current < minHarvesters;
                        },
                        build: () => buildGenericCreepBody(room, creepCount),
                    });
                }
            }
        }

        // Priority 2: Haulers (until MIN_HAULERS met)
        const dedicatedHaulers = Object.values(Game.creeps).filter(
            (c) =>
                c.room.name === room.name &&
                c.memory.role === "hauler" &&
                c.memory.fixedRole === true,
        ).length;

        const minHaulers = config.MIN_HAULERS || 2;
        if (dedicatedHaulers < minHaulers) {
            for (let i = dedicatedHaulers; i < minHaulers; i += 1) {
                queue.push({
                    priority: 2,
                    type: "hauler",
                    validate: () => {
                        const current = Object.values(Game.creeps).filter(
                            (c) =>
                                c.room.name === room.name &&
                                c.memory.role === "hauler" &&
                                c.memory.fixedRole === true,
                        ).length;
                        return current < minHaulers;
                    },
                    build: () => buildHaulerBody(room, creepCount),
                });
            }
        }

        // Priority 3: Generic creeps (until creep minimum met)
        const minCreeps = config.getMinCreeps(roomLevel);
        const effectiveMin = Math.max(calculatedMin, minCreeps);
        if (creepCount < effectiveMin) {
            for (let i = creepCount; i < effectiveMin; i += 1) {
                queue.push({
                    priority: 3,
                    type: "generic",
                    validate: () => {
                        const current = room
                            .find(FIND_MY_CREEPS)
                            .filter((c) => !c.memory.targetRoom).length;
                        return current < effectiveMin;
                    },
                    build: () => buildGenericCreepBody(room, creepCount),
                });
            }
        }

        return queue;
    },

    /**
     * Spawns creeps based on priority queue
     * @param {number} creepCount - Current number of creeps
     * @param {number} calculatedMin - Dynamically calculated minimum
     * @param {Room} room - Room to spawn for
     * @param {StructureSpawn} spawn - Spawn to use for this room
     */
    run: function (creepCount, calculatedMin, room, spawn) {
        const spawns = room.find(FIND_MY_SPAWNS);
        const activeSpawn =
            spawn || spawns.find((s) => !s.spawning) || spawns[0];
        if (!activeSpawn || activeSpawn.spawning) {
            return;
        }

        const energyAvailable = room.energyAvailable;
        const energyCapacity = room.energyCapacityAvailable;
        const config = require("config");
        const CRITICAL_CREEPS = config.CRITICAL_CREEPS;

        // Emergency bootstrap: if critically low on creeps, spawn a worker ASAP
        if (creepCount < CRITICAL_CREEPS) {
            const emergencyBody = buildEmergencyHarvesterBody(energyAvailable);
            if (!emergencyBody) {
                return;
            }
            const emergencyName = `Emergency${Game.time}`;
            const result = activeSpawn.spawnCreep(
                emergencyBody,
                emergencyName,
                {
                    memory: {
                        role: "harvester",
                        fixedRole: true,
                        emergency: true,
                    },
                },
            );
            if (result === OK) {
                const emergencyCost = emergencyBody.reduce(
                    (sum, part) => sum + BODYPART_COST[part],
                    0,
                );
                console.log(
                    `Spawning emergency creep: ${emergencyName} (cost: ${emergencyCost}E)`,
                );
                return; // Spawn one per tick
            }
        }

        // Process custom spawn queue first (user-requested creeps)
        if (Memory.customSpawnQueue && Memory.customSpawnQueue.length > 0) {
            const customItem = Memory.customSpawnQueue[0];
            const REMOTE_BODIES = {
                reserver: {
                    body: [CLAIM, CLAIM, MOVE, MOVE],
                    cost: 1300,
                },
                attacker: {
                    body: [
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        RANGED_ATTACK,
                        RANGED_ATTACK,
                        TOUGH,
                        TOUGH,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                    ],
                    cost: 1020,
                },
                builder: {
                    body: [
                        WORK,
                        WORK,
                        WORK,
                        CARRY,
                        CARRY,
                        CARRY,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                    ],
                    cost: 750,
                },
                miner: {
                    body: [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE],
                    cost: 350,
                },
            };

            const roleDef = REMOTE_BODIES[customItem.role];
            if (roleDef && energyAvailable >= roleDef.cost) {
                const body = roleDef.body;
                const memoryObj = {
                    role: customItem.role,
                    targetRoom: customItem.targetRoom,
                    fixedRole: true,
                    ...customItem.memoryOverrides,
                };
                const name = `${customItem.role}_${Game.time}`;
                const result = activeSpawn.spawnCreep(body, name, {
                    memory: memoryObj,
                });

                if (result === OK) {
                    console.log(
                        `Spawning custom ${customItem.role} for ${customItem.targetRoom}: ${name}`,
                    );
                    Memory.customSpawnQueue.shift(); // Remove from queue
                    return; // Spawn one per tick
                }
            }
        }

        // Build queue
        const queue = this.buildSpawnQueue(creepCount, calculatedMin, room);

        // Store queue in memory for inspection
        Memory.spawnQueues = Memory.spawnQueues || {};
        Memory.spawnQueues[room.name] = queue.map((item) => ({
            priority: item.priority,
            type: item.type,
            sourceId: item.sourceId || null,
        }));

        // Process queue
        for (const item of queue) {
            // Validate entry (might be stale)
            if (!item.validate()) {
                continue;
            }

            // Build body
            const body = item.build();

            // Skip if body builder returned null (not enough energy)
            if (!body || body.length === 0) {
                continue;
            }

            const cost = body.reduce(
                (sum, part) => sum + BODYPART_COST[part],
                0,
            );

            // Check if we have enough energy
            if (energyAvailable < cost) {
                continue; // Skip to next item
            }

            // Spawn it!
            let memoryObj = { fixedRole: true };

            if (item.type === "miner") {
                memoryObj.role = "miner";
                memoryObj.sourceId = item.sourceId;
            } else if (item.type === "harvester") {
                memoryObj.role = "harvester";
                memoryObj.fixedRole = true; // Emergency harvesters are specialists
            } else if (item.type === "hauler") {
                memoryObj.role = "hauler";
            } else if (item.type === "generic") {
                memoryObj.role = "builder"; // Role manager will reassign
                memoryObj.fixedRole = false; // Allow role reassignment
            } else if (item.type === "reserver") {
                memoryObj.role = "reserver";
                memoryObj.targetRoom = item.targetRoom;
            } else if (item.type === "attacker") {
                memoryObj.role = "attacker";
                memoryObj.targetRoom = item.targetRoom;
            } else if (item.type === "remote_builder") {
                memoryObj.role = "remote_builder";
                memoryObj.targetRoom = item.targetRoom;
                memoryObj.assignedSourceId = item.sourceId;
            } else if (item.type === "remote_miner") {
                memoryObj.role = "miner";
                memoryObj.targetRoom = item.targetRoom;
                memoryObj.assignedSourceId = item.sourceId;
            } else if (item.type === "remote_hauler") {
                memoryObj.role = "remote_hauler";
                memoryObj.targetRoom = item.targetRoom;
                memoryObj.homeRoom = room.name;
                memoryObj.assignedMinerId = item.minerId;
            } else if (item.type === "remote_repairer") {
                memoryObj.role = "remote_repairer";
                memoryObj.targetRoom = item.targetRoom;
            }

            const newName =
                item.type.charAt(0).toUpperCase() +
                item.type.slice(1) +
                Game.time;
            const result = activeSpawn.spawnCreep(body, newName, {
                memory: memoryObj,
            });

            if (result === OK) {
                if (item.type !== "generic" || Game.time % 50 === 0) {
                    console.log(
                        `Spawning ${item.type}: ${newName} (cost: ${cost}E)`,
                    );
                }
            } else {
                console.log(
                    `ERROR spawning ${item.type}: ${newName} - error code ${result}`,
                );
            }

            return; // Spawn one per tick
        }
    },
};

module.exports = spawner;

var config = require("config");
var creepCalculator = require("creep.calculator");
var remoteManager = require("remote.manager");

const MIN_CREEPS = config.MIN_CREEPS;
const CRITICAL_CREEPS = config.CRITICAL_CREEPS;
const MIN_HAULERS = config.MIN_HAULERS;

function buildMinerBody() {
    // Efficient dedicated miner: 5 WORK yields 10 energy/tick (exactly drains a source in ~300 ticks)
    return [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE];
}

function buildHaulerBody(room) {
    // Haulers with 10 CARRY + 10 MOVE (1:1 ratio) = 1000 energy
    // This allows frequent spawning and keeps miners from backing up
    const energyAvailable = room.energyAvailable;

    // Target body: 10 CARRY + 10 MOVE
    const targetCarry = 10;
    const targetMove = 10;
    const targetCost = (targetCarry + targetMove) * BODYPART_COST[CARRY]; // 1000 energy

    if (energyAvailable >= targetCost) {
        // Build target body
        const body = [];
        for (let i = 0; i < targetCarry; i += 1) {
            body.push(CARRY);
        }
        for (let i = 0; i < targetMove; i += 1) {
            body.push(MOVE);
        }
        return body;
    } else if (energyAvailable >= 100) {
        // Fallback: scale down proportionally
        const carryMovePairCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE]; // 100
        const pairCount = Math.floor(energyAvailable / carryMovePairCost);
        const body = [];
        for (let i = 0; i < pairCount; i += 1) {
            body.push(CARRY);
        }
        for (let i = 0; i < pairCount; i += 1) {
            body.push(MOVE);
        }
        return body;
    } else {
        // Minimal fallback
        return [CARRY, MOVE];
    }
}

function buildGenericCreepBody(room) {
    // Generic body for builder/upgrader/repairer - smaller bodies that spawn faster
    // Fixed: 3 WORK + 2 CARRY + 2 MOVE = 350 energy
    // Prioritize spawning frequency over individual creep size
    const body = [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
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
                    build: () => buildHaulerBody(room),
                });
            }
        }

        // Priority 3: Generic creeps (until creep minimum met)
        const effectiveMin = Math.max(calculatedMin, config.MIN_CREEPS);
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
                    build: () => buildGenericCreepBody(room),
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

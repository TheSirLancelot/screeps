var config = require("config");
var creepCalculator = require("creep.calculator");

const MIN_CREEPS = config.MIN_CREEPS;
const CRITICAL_CREEPS = config.CRITICAL_CREEPS;
const MIN_HAULERS = config.MIN_HAULERS;

function buildBodyForEnergy(room) {
    const energyAvailable = room.energyAvailable;
    const partsPerPair = 4;
    const maxPairs = Math.floor(50 / partsPerPair);
    const pairCost =
        BODYPART_COST[WORK] + BODYPART_COST[CARRY] + 2 * BODYPART_COST[MOVE];
    const pairCount = Math.min(
        Math.floor(energyAvailable / pairCost),
        maxPairs,
    );
    let remainingEnergy = energyAvailable - pairCount * pairCost;

    const body = [];
    if (pairCount === 0) {
        body.push(WORK, CARRY, MOVE);
        console.log(
            "Fallback body used (insufficient energy for pair):",
            JSON.stringify(body),
            "energy:",
            energyAvailable,
        );
    }
    for (let i = 0; i < pairCount; i += 1) {
        body.push(WORK);
    }
    for (let i = 0; i < pairCount; i += 1) {
        body.push(CARRY);
    }
    for (let i = 0; i < pairCount * 2; i += 1) {
        body.push(MOVE);
    }
    const maxExtraWork = 50 - body.length;
    const extraWork = Math.min(
        Math.floor(remainingEnergy / BODYPART_COST[WORK]),
        maxExtraWork,
    );
    for (let i = 0; i < extraWork; i += 1) {
        body.push(WORK);
    }
    remainingEnergy -= extraWork * BODYPART_COST[WORK];

    const baseNonMoveCount = pairCount * 2;
    const moveCount = body.filter((part) => part === MOVE).length;
    if (moveCount < baseNonMoveCount) {
        const missingMoves = Math.min(
            baseNonMoveCount - moveCount,
            50 - body.length,
        );
        for (let i = 0; i < missingMoves; i += 1) {
            body.push(MOVE);
        }
        console.log(
            "Adjusted body to maintain MOVE ratio:",
            JSON.stringify(body),
        );
    } else {
        console.log(
            "Calculated body:",
            JSON.stringify(body),
            "energy:",
            energyAvailable,
        );
    }

    return body;
}

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
    // Target: 3 WORK + 2 CARRY + 2 MOVE = ~350 energy
    // Prioritize spawning frequency over individual creep size
    const energyAvailable = room.energyAvailable;

    // Core body: 3 WORK + 2 CARRY + 2 MOVE = 350 energy
    const body = [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];

    // If we have extra energy, add pairs of WORK + MOVE (not CARRY, work is the bottleneck)
    let remainingEnergy = energyAvailable - 350;
    while (
        remainingEnergy >= BODYPART_COST[WORK] + BODYPART_COST[MOVE] &&
        body.length < 50
    ) {
        body.push(WORK);
        body.push(MOVE);
        remainingEnergy -= BODYPART_COST[WORK] + BODYPART_COST[MOVE];
    }

    // If still room and energy, add one more MOVE for every non-MOVE part (mobility)
    const nonMoveParts = body.filter((p) => p !== MOVE).length;
    const moveParts = body.filter((p) => p === MOVE).length;
    if (
        moveParts < nonMoveParts &&
        remainingEnergy >= BODYPART_COST[MOVE] &&
        body.length < 50
    ) {
        body.push(MOVE);
    }

    return body;
}

var spawner = {
    /**
     * Spawns dedicated miners first, then generic creeps until the calculated minimum is reached
     * @param {number} creepCount - Current number of creeps
     * @param {number} calculatedMin - Dynamically calculated minimum (uses MIN_CREEPS as floor)
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

        // Priority 1: Spawn dedicated miners (1 per source)
        const minerBody = buildMinerBody();
        const sources = room.find(FIND_SOURCES);
        const minersBySource = {};
        for (let i = 0; i < sources.length; i += 1) {
            minersBySource[sources[i].id] = 0;
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

        const minerCost = minerBody.reduce(
            (sum, part) => sum + BODYPART_COST[part],
            0,
        );
        if (energyAvailable >= minerCost) {
            for (let i = 0; i < sources.length; i += 1) {
                const source = sources[i];
                if ((minersBySource[source.id] || 0) === 0) {
                    const newName = "Miner" + Game.time;
                    activeSpawn.spawnCreep(minerBody, newName, {
                        memory: {
                            role: "miner",
                            sourceId: source.id,
                            fixedRole: true,
                        },
                    });
                    return;
                }
            }
        }

        // Priority 2: Spawn dedicated haulers (until MIN_HAULERS met)
        // Count ONLY dedicated haulers (fixedRole: true), not generic creeps reassigned to hauler
        const haulerBody = buildHaulerBody(room);
        const dedicatedHaulers = {};
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (
                creep.room === room &&
                creep.memory.role === "hauler" &&
                creep.memory.fixedRole === true
            ) {
                dedicatedHaulers[name] = creep;
            }
        }
        const dedicatedHaulerCount = Object.keys(dedicatedHaulers).length;

        const haulerCost = haulerBody.reduce(
            (sum, part) => sum + BODYPART_COST[part],
            0,
        );
        if (
            dedicatedHaulerCount < MIN_HAULERS &&
            energyAvailable >= haulerCost
        ) {
            const criticallyLow = creepCount < CRITICAL_CREEPS;
            const shouldWait =
                !criticallyLow && energyAvailable < energyCapacity;

            if (!shouldWait) {
                const newName = "Hauler" + Game.time;
                console.log(
                    "Spawning hauler:",
                    newName,
                    "body:",
                    JSON.stringify(haulerBody),
                );
                activeSpawn.spawnCreep(haulerBody, newName, {
                    memory: {
                        role: "hauler",
                        fixedRole: true,
                    },
                });
                return;
            }
        }

        // Priority 3: Spawn generic creeps for builder/upgrader/repairer until creep minimum met
        const effectiveMin = Math.max(calculatedMin, MIN_CREEPS);
        if (creepCount < effectiveMin) {
            const criticallyLow = creepCount < CRITICAL_CREEPS;

            // If not critically low, wait until energy is full before spawning
            if (!criticallyLow && energyAvailable < energyCapacity) {
                // waiting for full energy to build stronger creeps
                return;
            }

            // Build appropriate body for available energy
            let body;
            if (energyAvailable >= energyCapacity) {
                // Use full energy if available
                body = buildGenericCreepBody(room);
            } else if (criticallyLow) {
                // If critically low, spawn minimal/better depending on energy
                body =
                    energyAvailable >= 150
                        ? buildGenericCreepBody(room)
                        : [WORK, CARRY, MOVE];
            } else {
                // This branch is unlikely because of the early return above,
                // but fall back to a basic creep to be safe.
                body = [WORK, CARRY, MOVE];
            }

            if (body) {
                const newName = "Creep" + Game.time;
                // Spawn as builder initially; role manager will reassign based on room needs
                // (builder/upgrader/repairer/hauler). Dedicated haulers handle pure hauling.
                activeSpawn.spawnCreep(body, newName, {
                    memory: { role: "builder" },
                });
            }
        }
    },
};

module.exports = spawner;

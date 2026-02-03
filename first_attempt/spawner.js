var config = require("config");
var creepCalculator = require("creep.calculator");

const MIN_CREEPS = config.MIN_CREEPS;
const CRITICAL_CREEPS = config.CRITICAL_CREEPS;
const MIN_HAULERS = config.MIN_HAULERS;

function buildBodyForEnergy() {
    const energyAvailable = Game.spawns["Spawn1"].room.energyAvailable;
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

function buildHaulerBody() {
    // Haulers only withdraw/transfer (no harvesting), so maximize CARRY:MOVE ratio
    // At 1500 energy: ~15 CARRY + 15 MOVE (1:1 ratio for balanced speed/capacity)
    const energyAvailable = Game.spawns["Spawn1"].room.energyAvailable;
    const carryMovePairCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE]; // 50 + 50 = 100
    const pairCount = Math.min(
        Math.floor(energyAvailable / carryMovePairCost),
        25, // Max 25 pairs (50 body parts total)
    );
    let remainingEnergy = energyAvailable - pairCount * carryMovePairCost;

    const body = [];
    if (pairCount === 0) {
        // Fallback: minimal hauler (if energy < 100, which is rare)
        body.push(CARRY, MOVE);
    } else {
        // Add all CARRY parts first
        for (let i = 0; i < pairCount; i += 1) {
            body.push(CARRY);
        }
        // Add paired MOVE parts
        for (let i = 0; i < pairCount; i += 1) {
            body.push(MOVE);
        }
        // Add extra CARRY if remaining energy allows (up to body size limit)
        const maxExtraCarry = 50 - body.length;
        const extraCarry = Math.min(
            Math.floor(remainingEnergy / BODYPART_COST[CARRY]),
            maxExtraCarry,
        );
        for (let i = 0; i < extraCarry; i += 1) {
            body.push(CARRY);
        }
        remainingEnergy -= extraCarry * BODYPART_COST[CARRY];

        // If still room and energy left, add extra MOVE for speed
        const maxExtraMove = 50 - body.length;
        const extraMove = Math.min(
            Math.floor(remainingEnergy / BODYPART_COST[MOVE]),
            maxExtraMove,
        );
        for (let i = 0; i < extraMove; i += 1) {
            body.push(MOVE);
        }
    }

    return body;
}

function buildGenericCreepBody() {
    // Generic body for creeps that may be reassigned to hauler/builder/upgrader/repairer
    // Balance WORK (for construction/upgrading) + CARRY (for hauling) + MOVE (for speed)
    // At 1500 energy: roughly 8 WORK + 8 CARRY + 6 MOVE = balanced for all roles
    const energyAvailable = Game.spawns["Spawn1"].room.energyAvailable;

    // Cost per work-carry-move triplet (50 + 50 + 50 = 150)
    const tripletCost =
        BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
    const tripletCount = Math.min(
        Math.floor(energyAvailable / tripletCost),
        16, // Max 16 triplets (48 body parts)
    );
    let remainingEnergy = energyAvailable - tripletCount * tripletCost;

    const body = [];
    if (tripletCount === 0) {
        // Fallback: minimal generic (if energy < 150)
        body.push(WORK, CARRY, MOVE);
        console.log(
            "Minimal generic body used (insufficient energy for triplet):",
            JSON.stringify(body),
            "energy:",
            energyAvailable,
        );
    } else {
        // Add balanced triplets
        for (let i = 0; i < tripletCount; i += 1) {
            body.push(WORK);
        }
        for (let i = 0; i < tripletCount; i += 1) {
            body.push(CARRY);
        }
        for (let i = 0; i < tripletCount; i += 1) {
            body.push(MOVE);
        }

        // Add extra WORK if remaining energy allows (for upgrading/building power)
        const maxExtraWork = 50 - body.length;
        const extraWork = Math.min(
            Math.floor(remainingEnergy / BODYPART_COST[WORK]),
            maxExtraWork,
        );
        for (let i = 0; i < extraWork; i += 1) {
            body.push(WORK);
        }
        remainingEnergy -= extraWork * BODYPART_COST[WORK];

        // If still room and energy left, add extra MOVE
        const maxExtraMove = 50 - body.length;
        const extraMove = Math.min(
            Math.floor(remainingEnergy / BODYPART_COST[MOVE]),
            maxExtraMove,
        );
        for (let i = 0; i < extraMove; i += 1) {
            body.push(MOVE);
        }
        console.log(
            "Calculated generic body:",
            JSON.stringify(body),
            "energy:",
            energyAvailable,
        );
    }

    return body;
}

var spawner = {
    /**
     * Spawns dedicated miners first, then generic creeps until the calculated minimum is reached
     * @param {number} creepCount - Current number of creeps
     * @param {number} calculatedMin - Dynamically calculated minimum (uses MIN_CREEPS as floor)
     * @param {Room} room - Room to spawn for
     */
    run: function (creepCount, calculatedMin, room) {
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
                    Game.spawns["Spawn1"].spawnCreep(minerBody, newName, {
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
        const haulerBody = buildHaulerBody();
        const haulersByRoom = {};
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.room === room && creep.memory.role === "hauler") {
                haulersByRoom[name] = creep;
            }
        }
        const haulerCount = Object.keys(haulersByRoom).length;

        const haulerCost = haulerBody.reduce(
            (sum, part) => sum + BODYPART_COST[part],
            0,
        );
        if (haulerCount < MIN_HAULERS && energyAvailable >= haulerCost) {
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
                Game.spawns["Spawn1"].spawnCreep(haulerBody, newName, {
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
                body = buildGenericCreepBody();
            } else if (criticallyLow) {
                // If critically low, spawn minimal/better depending on energy
                body =
                    energyAvailable >= 150
                        ? buildGenericCreepBody()
                        : [WORK, CARRY, MOVE];
            } else {
                // This branch is unlikely because of the early return above,
                // but fall back to a basic creep to be safe.
                body = [WORK, CARRY, MOVE];
            }

            if (body) {
                const newName = "Creep" + Game.time;
                Game.spawns["Spawn1"].spawnCreep(body, newName, {
                    memory: { role: "hauler" },
                });
            }
        }
    },
};

module.exports = spawner;

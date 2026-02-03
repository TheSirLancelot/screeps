var config = require("config");
var creepCalculator = require("creep.calculator");

const MIN_CREEPS = config.MIN_CREEPS;
const CRITICAL_CREEPS = config.CRITICAL_CREEPS;

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

        // Dedicated miners first: 1 miner per source (5 WORK parts drains 3000 energy in 300 ticks)
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

        // Find first source that needs a miner
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
                body = buildBodyForEnergy();
            } else if (criticallyLow) {
                // If critically low, spawn minimal/better depending on energy
                body =
                    energyAvailable >= 200
                        ? buildBodyForEnergy()
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

var config = require("config");

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

var spawner = {
    /**
     * Spawns generic creeps until the calculated minimum is reached
     * All creeps start as harvesters; role assignment happens elsewhere
     * @param {number} creepCount - Current number of creeps
     * @param {number} calculatedMin - Dynamically calculated minimum (uses MIN_CREEPS as floor)
     */
    run: function (creepCount, calculatedMin) {
        const effectiveMin = Math.max(calculatedMin, MIN_CREEPS);
        if (creepCount < effectiveMin) {
            const energyAvailable = Game.spawns["Spawn1"].room.energyAvailable;
            const energyCapacity =
                Game.spawns["Spawn1"].room.energyCapacityAvailable;
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
                    memory: { role: "harvester" },
                });
            }
        }
    },
};

module.exports = spawner;

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
    /** @param {int} harvesters, @param {int} builders, @param {int} upgraders, @param {int} repairers */
    run: function (harvesters, builders, upgraders, repairers) {
        const energyAvailable = Game.spawns["Spawn1"].room.energyAvailable;
        const energyCapacity =
            Game.spawns["Spawn1"].room.energyCapacityAvailable;
        const canUseMax = energyAvailable === energyCapacity;
        if (harvesters < 5) {
            var newName = "Harvester" + Game.time;
            console.log("Spawning new harvester: " + newName);
            const body =
                harvesters <= 2
                    ? [WORK, CARRY, MOVE]
                    : canUseMax
                      ? buildBodyForEnergy()
                      : null;
            if (body) {
                Game.spawns["Spawn1"].spawnCreep(body, newName, {
                    memory: { role: "harvester" },
                });
            }
        } else if (repairers < 2) {
            var newName = "Repairer" + Game.time;
            console.log("Spawning new repairer: " + newName);
            const body = canUseMax ? buildBodyForEnergy() : null;
            if (body) {
                Game.spawns["Spawn1"].spawnCreep(body, newName, {
                    memory: { role: "repairer" },
                });
            }
        } else if (builders < 3) {
            var newName = "Builder" + Game.time;
            console.log("Spawning new builder: " + newName);
            const body = canUseMax ? buildBodyForEnergy() : null;
            if (body) {
                Game.spawns["Spawn1"].spawnCreep(body, newName, {
                    memory: { role: "builder" },
                });
            }
        } else if (upgraders < 2) {
            var newName = "Upgrader" + Game.time;
            console.log("Spawning new upgrader: " + newName);
            const body = canUseMax ? buildBodyForEnergy() : null;
            if (body) {
                Game.spawns["Spawn1"].spawnCreep(body, newName, {
                    memory: { role: "upgrader" },
                });
            }
        }
    },
};

module.exports = spawner;

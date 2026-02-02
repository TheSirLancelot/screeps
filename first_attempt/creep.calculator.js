/**
 * Creep Calculator
 * Dynamically determines ideal creep composition based on room state
 */

var roleEvaluator = require("role.evaluator");

var creepCalculator = {
    /**
     * Estimate the cost of a typical creep body that would be spawned now
     * @param {Room} room - The room
     * @returns {number} Energy cost of body
     */
    _estimateCreepBodyCost: function (room) {
        const energyAvailable = room.energyAvailable;
        const energyCapacity = room.energyCapacityAvailable;
        const actualEnergy = Math.max(energyAvailable, energyCapacity * 0.5); // Use available or half capacity as estimate

        // Mimic spawner.js logic: 1 WORK, 1 CARRY, 2 MOVE per pair
        const partsPerPair = 4;
        const pairCost =
            BODYPART_COST[WORK] +
            BODYPART_COST[CARRY] +
            2 * BODYPART_COST[MOVE];
        const pairCount = Math.min(Math.floor(actualEnergy / pairCost), 12); // reasonable max

        let bodyCost = 0;
        for (let i = 0; i < pairCount; i++) {
            bodyCost += BODYPART_COST[WORK];
        }
        for (let i = 0; i < pairCount; i++) {
            bodyCost += BODYPART_COST[CARRY];
        }
        for (let i = 0; i < pairCount * 2; i++) {
            bodyCost += BODYPART_COST[MOVE];
        }

        // Add extra WORK parts with remaining energy
        const remainingEnergy = actualEnergy - bodyCost;
        const extraWork = Math.min(
            Math.floor(remainingEnergy / BODYPART_COST[WORK]),
            50 - bodyCost / 50,
        );
        bodyCost += extraWork * BODYPART_COST[WORK];

        return bodyCost;
    },

    /**
     * Calculate the minimum number of creeps needed based on room state
     * @param {Room} room - The room to analyze
     * @returns {number} Recommended minimum creep count
     */
    calculateMinCreeps: function (room) {
        var config = require("config");

        // Start with harvesters - respect config limits
        const sources = room.find(FIND_SOURCES);
        let totalCreeps = Math.min(sources.length + 1, config.MAX_HARVESTERS);
        totalCreeps = Math.max(totalCreeps, config.MIN_HARVESTERS);

        // Add other roles only if they're truly needed (based on room state)
        const scores = roleEvaluator.getScores(room);

        if (scores.builder > 0) {
            totalCreeps += 1;
        }
        if (scores.repairer > 0) {
            totalCreeps += 1;
        }
        const upgraderNeed = scores.upgrader > 0 ? 1 : 0;
        totalCreeps += Math.max(upgraderNeed, config.MIN_UPGRADERS);

        // Add hauler only if storage exists
        const storage = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_STORAGE,
        });
        if (storage.length > 0) {
            totalCreeps += config.MIN_HAULERS;
        }

        // Ensure we're always recommending at least MIN_CREEPS + buffer for wiggle room
        totalCreeps = Math.max(totalCreeps, config.MIN_CREEPS + 2);

        return totalCreeps;
    },
};

module.exports = creepCalculator;

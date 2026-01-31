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
     * Calculate the minimum number of creeps needed based on energy supply/demand
     * @param {Room} room - The room to analyze
     * @returns {number} Recommended minimum creep count
     */
    calculateMinCreeps: function (room) {
        const CREEP_LIFETIME = 1500; // ticks
        const ENERGY_PER_WORK_PER_TICK = 1; // 1 energy harvested per WORK per tick

        // Energy Supply: sources
        const sources = room.find(FIND_SOURCES);
        const totalSourceEnergy = sources.length * ENERGY_PER_WORK_PER_TICK;

        // Energy Demand: maintenance
        const extensions = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_EXTENSION,
        }).length;
        const spawns = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_SPAWN,
        }).length;
        const towers = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_TOWER,
        }).length;
        const storage = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_STORAGE,
        });

        // Maintenance energy demand per tick
        const extensionCapacity = extensions * 50;
        const spawnCapacity = spawns * 300;
        const towerMaintenanceDemand = towers * 5; // rough tower drain per tick
        const storageMaintenanceDemand = storage.length > 0 ? 2 : 0; // storage fills up slowly
        const maintenancePerTick =
            (extensionCapacity + spawnCapacity) * 0.01 +
            towerMaintenanceDemand +
            storageMaintenanceDemand;

        // Spawn cost overhead
        const estimatedBodyCost = this._estimateCreepBodyCost(room);
        const spawnOverheadPerTick = (estimatedBodyCost / CREEP_LIFETIME) * 10; // 10 creeps to maintain

        // Total energy demand per tick
        const totalEnergyDemand = maintenancePerTick + spawnOverheadPerTick;

        // Calculate harvesters needed
        // Account for fact that harvester bodies have CARRY/MOVE parts too
        // Rough estimate: 2/3 of body is WORK, 1/3 is CARRY/MOVE overhead
        const workPartRatio = 0.6;
        const harvestersNeeded = Math.ceil(
            totalEnergyDemand /
                (totalSourceEnergy * workPartRatio * ENERGY_PER_WORK_PER_TICK),
        );

        // Calculate other roles based on room state scores
        const scores = roleEvaluator.getScores(room);
        let buildersNeeded = scores.builder > 0 ? 1 : 0;
        let repairersNeeded = scores.repairer > 0 ? 1 : 0;
        let upgradersNeeded = scores.upgrader > 0 ? 1 : 0;

        const recommendedTotal =
            harvestersNeeded +
            buildersNeeded +
            repairersNeeded +
            upgradersNeeded;

        return recommendedTotal;
    },
};

module.exports = creepCalculator;

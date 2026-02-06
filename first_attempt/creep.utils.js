/**
 * Creep Utils
 * Common behaviors and utilities for all creeps
 */

var config = require("config");

var creepUtils = {
    /**
     * Repair a road underfoot if present and damaged
     * @param {Creep} creep - The creep to check
     */
    repairRoadUnderfoot: function (creep) {
        const structures = creep.pos.lookFor(LOOK_STRUCTURES);
        const road = structures.find(
            (structure) => structure.structureType === STRUCTURE_ROAD,
        );

        if (
            road &&
            road.hits < road.hitsMax &&
            creep.store[RESOURCE_ENERGY] > 0 &&
            creep.getActiveBodyparts(WORK) > 0
        ) {
            creep.repair(road);
        }
    },

    /**
     * Perform common creep maintenance tasks
     * @param {Creep} creep - The creep to maintain
     * @param {RoomTerrain} terrain - Room terrain object (pre-fetched for efficiency)
     */
    maintain: function (creep, terrain) {
        this.repairRoadUnderfoot(creep);
    },
};

module.exports = creepUtils;

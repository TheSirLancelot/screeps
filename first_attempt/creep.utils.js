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
     * Check if creep is standing on a road and build one if needed
     * @param {Creep} creep - The creep to check
     * @param {RoomTerrain} terrain - Room terrain object (pre-fetched for efficiency)
     */
    buildRoadIfNeeded: function (creep, terrain) {
        const terrainCode = terrain.get(creep.pos.x, creep.pos.y);
        if (terrainCode === TERRAIN_MASK_WALL) {
            return; // Can't build on walls
        }

        // Check if there's already a road here
        const structures = creep.pos.lookFor(LOOK_STRUCTURES);
        const road = structures.find(
            (structure) => structure.structureType === STRUCTURE_ROAD,
        );

        if (road) {
            return; // Already has a road
        }

        // Check if there's already a construction site for a road
        const constructionSites = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES);
        const hasRoadSite = constructionSites.some(
            (site) => site.structureType === STRUCTURE_ROAD,
        );

        if (hasRoadSite) {
            return; // Road already being built
        }

        // Create construction site for road
        const result = creep.room.createConstructionSite(
            creep.pos,
            STRUCTURE_ROAD,
        );
        if (result === OK) {
            // Uncomment to log road placements
            // console.log(`${creep.name}: building road at ${creep.pos}`);
        }
    },

    /**
     * Perform common creep maintenance tasks
     * @param {Creep} creep - The creep to maintain
     * @param {RoomTerrain} terrain - Room terrain object (pre-fetched for efficiency)
     */
    maintain: function (creep, terrain) {
        this.repairRoadUnderfoot(creep);
        if (
            creep.memory.role === "reserver" ||
            creep.memory.role === "remote_builder" ||
            creep.memory.role === "remote_repairer" ||
            creep.memory.role === "remote_hauler" ||
            creep.memory.role === "attacker" ||
            (creep.memory.role === "miner" && creep.memory.targetRoom)
        ) {
            return;
        }
        if (
            creep.memory.targetRoom &&
            creep.room.name === creep.memory.targetRoom
        ) {
            return;
        }
        this.buildRoadIfNeeded(creep, terrain);
    },
};

module.exports = creepUtils;

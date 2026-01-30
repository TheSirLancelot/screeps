/**
 * Creep Utils
 * Common behaviors and utilities for all creeps
 */

var creepUtils = {
    /**
     * Check if creep is standing on a road and build one if needed
     * @param {Creep} creep - The creep to check
     * @param {RoomTerrain} terrain - Room terrain object (pre-fetched for efficiency)
     */
    buildRoadIfNeeded: function (creep, terrain) {
        // Only check periodically to avoid spam
        if (Game.time % 5 !== 0) {
            return;
        }

        const terrainCode = terrain.get(creep.pos.x, creep.pos.y);
        if (terrainCode === TERRAIN_MASK_WALL) {
            return; // Can't build on walls
        }

        // Check if there's already a road here
        const structures = creep.pos.lookFor(LOOK_STRUCTURES);
        const hasRoad = structures.some(
            (structure) => structure.structureType === STRUCTURE_ROAD,
        );

        if (hasRoad) {
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
        this.buildRoadIfNeeded(creep, terrain);
    },
};

module.exports = creepUtils;

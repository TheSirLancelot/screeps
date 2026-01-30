/**
 * Role Evaluator
 * Analyzes current game state and recommends roles based on what's needed
 */

var config = require("config");

var roleEvaluator = {
    /**
     * Calculate builder role score based on construction sites
     * @param {Room} room - The room to evaluate
     * @returns {number} Score for builder role
     */
    _scoreBuilder: function (room) {
        let score = 0;
        const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
        if (constructionSites.length > 0) {
            score +=
                constructionSites.length *
                config.ROLE_SCORES.BUILDER_SITE_SCORE;
        }
        return score;
    },

    /**
     * Calculate repairer role score based on damaged structures
     * @param {Room} room - The room to evaluate
     * @returns {number} Score for repairer role
     */
    _scoreRepairer: function (room) {
        let score = 0;

        // Count damaged structures (excluding walls)
        const damagedStructures = room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                structure.hits < structure.hitsMax &&
                structure.structureType !== STRUCTURE_WALL,
        });
        if (damagedStructures.length > 0) {
            score +=
                damagedStructures.length *
                config.ROLE_SCORES.REPAIRER_DAMAGE_SCORE;
        }

        // Emergency boost for critical structures
        const criticalDamaged = room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                (structure.structureType === STRUCTURE_SPAWN ||
                    structure.structureType === STRUCTURE_TOWER ||
                    structure.structureType === STRUCTURE_EXTENSION) &&
                structure.hits < structure.hitsMax * 0.5,
        });
        if (criticalDamaged.length > 0) {
            score +=
                criticalDamaged.length *
                config.ROLE_SCORES.REPAIRER_CRITICAL_SCORE;
        }

        return score;
    },

    /**
     * Calculate harvester role score based on structures needing energy
     * @param {Room} room - The room to evaluate
     * @returns {number} Score for harvester role
     */
    _scoreHarvester: function (room) {
        let score = 0;

        // Count structures that can accept energy
        const energyNeedingStructures = room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                (structure.structureType === STRUCTURE_SPAWN ||
                    structure.structureType === STRUCTURE_EXTENSION ||
                    structure.structureType === STRUCTURE_TOWER ||
                    structure.structureType === STRUCTURE_CONTAINER) &&
                structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        });

        // Score based on how many structures need energy
        score += energyNeedingStructures.length * 5;

        return score;
    },

    /**
     * Calculate upgrader role score based on controller status
     * @param {Room} room - The room to evaluate
     * @returns {number} Score for upgrader role
     */
    _scoreUpgrader: function (room) {
        let score = 0;
        const controller = room.controller;

        if (controller && controller.level < 8) {
            const controllerProgress = controller.progress || 0;
            const controllerProgressMax = controller.progressTotal || 200000;
            const progressPercent = controllerProgress / controllerProgressMax;
            score +=
                (1 - progressPercent) *
                config.ROLE_SCORES.UPGRADER_PROGRESS_SCORE;
        }

        return score;
    },

    /**
     * Determine the role with the highest score
     * @param {Object} scores - Object with role scores
     * @returns {string} Recommended role
     */
    _selectHighestScoredRole: function (scores) {
        let maxScore = -1;
        let recommendedRole = "harvester"; // default fallback

        for (const role in scores) {
            if (scores[role] > maxScore) {
                maxScore = scores[role];
                recommendedRole = role;
            }
        }

        return recommendedRole;
    },

    /**
     * Evaluates the current room state and returns recommended role
     * @param {Room} room - The room to evaluate
     * @param {Creep} creep - The creep needing a role (optional, for context)
     * @returns {string} Recommended role: "harvester", "builder", "upgrader", or "repairer"
     */
    evaluateRole: function (room, creep) {
        const scores = {
            harvester: this._scoreHarvester(room),
            builder: this._scoreBuilder(room),
            upgrader: this._scoreUpgrader(room),
            repairer: this._scoreRepairer(room),
        };

        return this._selectHighestScoredRole(scores);
    },

    /**
     * Get detailed scoring breakdown for debugging
     * @param {Room} room - The room to evaluate
     * @returns {Object} Score breakdown for each role
     */
    getScores: function (room) {
        return {
            harvester: this._scoreHarvester(room),
            builder: this._scoreBuilder(room),
            upgrader: this._scoreUpgrader(room),
            repairer: this._scoreRepairer(room),
        };
    },
};

module.exports = roleEvaluator;

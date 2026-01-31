/**
 * Global Configuration
 * Centralized settings for role management, spawning, and scoring
 */

var config = {
    // Role Manager - how often to re-evaluate creep roles (in ticks)
    ROLE_REEVALUATE_INTERVAL: 30,

    // Role Manager - minimum number of harvesters to maintain
    MIN_HARVESTERS: 1,

    // Spawner - target number of creeps to maintain
    MIN_CREEPS: 10,

    // Spawner - population threshold below which to spawn even without full energy
    CRITICAL_CREEPS: 5,

    // Role Scores - multipliers for scoring different roles
    ROLE_SCORES: {
        BUILDER_SITE_SCORE: 10, // per construction site
        REPAIRER_DAMAGE_SCORE: 8, // per damaged structure
        REPAIRER_CRITICAL_SCORE: 20, // per critical structure
        HARVESTER_ENERGY_DIVISOR: 100, // total source energy divided by this
        HARVESTER_FALLBACK_SCORE: 5, // when sources empty but storage has energy
        UPGRADER_PROGRESS_SCORE: 15, // scaled by room controller progress
    },

    // Creep Utils - how often to check if a road needs building (in ticks)
    ROAD_BUILD_INTERVAL: 5,
};

module.exports = config;

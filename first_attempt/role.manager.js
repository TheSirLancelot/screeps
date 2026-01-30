/**
 * Role Manager
 * Assigns and updates creep roles based on room state using the role evaluator
 */

var roleEvaluator = require("role.evaluator");

// How often creeps should re-evaluate their role (in ticks)
const ROLE_REEVALUATE_INTERVAL = 10;

// Icons for each role
const ROLE_ICONS = {
    harvester: "⛏️",
    builder: "🚧",
    upgrader: "⚡",
    repairer: "🔧",
};

var roleManager = {
    /**
     * Evaluates a single creep and updates its role if needed
     * Evaluation is staggered based on creep TTL to avoid all creeps changing roles at once
     * @param {Creep} creep - The creep to evaluate
     * @param {Room} room - The room context
     */
    evaluateCreep: function (creep, room) {
        // Stagger evaluations based on creep TTL so not all creeps evaluate at once
        const shouldReevaluate =
            creep.ticksToLive % ROLE_REEVALUATE_INTERVAL ===
            Game.time % ROLE_REEVALUATE_INTERVAL;

        if (shouldReevaluate) {
            let recommendedRole = roleEvaluator.evaluateRole(room, creep);

            // If population in this room is low, force harvesters to prioritize energy
            let totalCreeps = 0;
            for (const cname in Game.creeps) {
                const c = Game.creeps[cname];
                if (c && c.room === room) {
                    totalCreeps += 1;
                }
            }
            if (totalCreeps < 10 && recommendedRole !== "harvester") {
                console.log(
                    `${creep.name}: forcing role to harvester (room population ${totalCreeps} < 10)`,
                );
                recommendedRole = "harvester";
            }

            // Update role if it changed
            if (creep.memory.role !== recommendedRole) {
                console.log(
                    `${creep.name}: changing role from ${creep.memory.role} to ${recommendedRole}`,
                );
                creep.memory.previousRole = creep.memory.role;
                creep.memory.role = recommendedRole;
                creep.memory.roleChangedAt = Game.time;
                creep.say(ROLE_ICONS[recommendedRole]);
            }
        }
    },

    /**
     * Evaluates all creeps in a room and assigns roles
     * @param {Room} room - The room to manage creeps in
     */
    manageAllCreeps: function (room) {
        for (var name in Game.creeps) {
            var creep = Game.creeps[name];
            if (creep.room === room) {
                this.evaluateCreep(creep, room);
            }
        }
    },

    /**
     * Get role statistics for a room
     * @param {Room} room - The room to analyze
     * @returns {Object} Count of creeps by role
     */
    getRoleStats: function (room) {
        const stats = {
            harvester: 0,
            builder: 0,
            upgrader: 0,
            repairer: 0,
        };

        for (var name in Game.creeps) {
            var creep = Game.creeps[name];
            if (
                creep.room === room &&
                stats.hasOwnProperty(creep.memory.role)
            ) {
                stats[creep.memory.role]++;
            }
        }

        return stats;
    },
};

module.exports = roleManager;

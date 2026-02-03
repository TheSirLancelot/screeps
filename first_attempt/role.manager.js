/**
 * Role Manager
 * Assigns and updates creep roles based on room state using the role evaluator
 */

var roleEvaluator = require("role.evaluator");
var config = require("config");

// Icons for each role
const ROLE_ICONS = {
    harvester: "⛏️",
    builder: "🚧",
    upgrader: "⚡",
    repairer: "🔧",
    hauler: "📦",
};

var roleManager = {
    /**
     * Evaluates a single creep and updates its role if needed
     * Evaluation is staggered based on creep TTL to avoid all creeps changing roles at once
     * @param {Creep} creep - The creep to evaluate
     * @param {Room} room - The room context
     */
    evaluateCreep: function (creep, room, roleStats) {
        // Dedicated roles (e.g., miners) should not be re-evaluated
        if (creep.memory.fixedRole === true || creep.memory.role === "miner") {
            return;
        }
        // Stagger evaluations based on a per-creep offset so not all creeps evaluate at once
        // Use Game.time instead of ticksToLive to avoid synchronized spawns switching together
        if (creep.memory.roleCheckOffset === undefined) {
            let hash = 0;
            for (let i = 0; i < creep.name.length; i += 1) {
                hash =
                    (hash * 31 + creep.name.charCodeAt(i)) %
                    config.ROLE_REEVALUATE_INTERVAL;
            }
            creep.memory.roleCheckOffset = hash;
        }
        const shouldReevaluate =
            (Game.time + creep.memory.roleCheckOffset) %
                config.ROLE_REEVALUATE_INTERVAL ===
            0;

        if (shouldReevaluate) {
            let recommendedRole = roleEvaluator.evaluateRole(room, creep);
            let forcedHarvester = false;

            // EMERGENCY: If hostiles in room, everyone becomes hauler to keep towers full
            const hostiles = room.find(FIND_HOSTILE_CREEPS);
            if (hostiles.length > 0 && recommendedRole !== "hauler") {
                console.log(
                    `${creep.name}: EMERGENCY - forcing role to hauler (${hostiles.length} hostiles in room)`,
                );
                recommendedRole = "hauler";
                forcedHarvester = true;
            }

            // If population in this room is low, force haulers to prioritize energy
            let totalCreeps = 0;
            for (const cname in Game.creeps) {
                const c = Game.creeps[cname];
                if (c && c.room === room) {
                    totalCreeps += 1;
                }
            }
            if (totalCreeps < 6 && recommendedRole !== "hauler") {
                console.log(
                    `${creep.name}: forcing role to hauler (room population ${totalCreeps} < 6)`,
                );
                recommendedRole = "hauler";
                forcedHarvester = true;
            }

            // If there are currently no haulers (or very few), prioritize creating at least one
            // This prevents situations where all creeps are non-haulers
            try {
                const haulers =
                    roleStats && roleStats.hauler ? roleStats.hauler : 0;
                if (
                    haulers < config.MIN_HAULERS &&
                    recommendedRole !== "hauler"
                ) {
                    console.log(
                        `${creep.name}: forcing role to hauler (haulers ${haulers} < ${config.MIN_HAULERS})`,
                    );
                    recommendedRole = "hauler";
                    forcedHarvester = true;
                }
            } catch (e) {
                // If roleStats isn't provided for some reason, skip this check
            }

            // Ensure at least one upgrader to avoid controller downgrade
            try {
                if (room.controller) {
                    const upgraders =
                        roleStats && roleStats.upgrader
                            ? roleStats.upgrader
                            : 0;
                    if (
                        upgraders < config.MIN_UPGRADERS &&
                        recommendedRole !== "upgrader"
                    ) {
                        console.log(
                            `${creep.name}: forcing role to upgrader (upgraders ${upgraders} < ${config.MIN_UPGRADERS})`,
                        );
                        recommendedRole = "upgrader";
                    }
                }
            } catch (e) {
                // If roleStats isn't provided for some reason, skip this check
            }

            // Prevent switching away from upgrader if it would drop below minimum
            if (
                creep.memory.role === "upgrader" &&
                recommendedRole !== "upgrader"
            ) {
                if (room.controller) {
                    const upgraders =
                        roleStats && roleStats.upgrader
                            ? roleStats.upgrader
                            : 0;
                    const upgradersAfterSwitch = upgraders - 1;
                    if (upgradersAfterSwitch < config.MIN_UPGRADERS) {
                        console.log(
                            `${creep.name}: cannot switch from upgrader to ${recommendedRole} (would leave < ${config.MIN_UPGRADERS} upgraders)`,
                        );
                        recommendedRole = "upgrader";
                    }
                }
            }

            // If there are currently no haulers (or very few), prioritize creating at least one
            // This prevents logistics failures when storage exists
            try {
                const storage = room.find(FIND_STRUCTURES, {
                    filter: (s) => s.structureType === STRUCTURE_STORAGE,
                });
                if (storage.length > 0) {
                    const haulers =
                        roleStats && roleStats.hauler ? roleStats.hauler : 0;
                    if (
                        haulers < config.MIN_HAULERS &&
                        recommendedRole !== "hauler"
                    ) {
                        console.log(
                            `${creep.name}: forcing role to hauler (haulers ${haulers} < ${config.MIN_HAULERS})`,
                        );
                        recommendedRole = "hauler";
                    }
                }
            } catch (e) {
                // If roleStats isn't provided for some reason, skip this check
            }

            // Prevent switching away from hauler if it would result in zero haulers (when storage exists)
            if (
                creep.memory.role === "hauler" &&
                recommendedRole !== "hauler"
            ) {
                const storage = room.find(FIND_STRUCTURES, {
                    filter: (s) => s.structureType === STRUCTURE_STORAGE,
                });
                if (storage.length > 0) {
                    const haulers =
                        roleStats && roleStats.hauler ? roleStats.hauler : 0;
                    const haulersAfterSwitch = haulers - 1; // -1 for this creep switching away
                    if (haulersAfterSwitch < config.MIN_HAULERS) {
                        console.log(
                            `${creep.name}: cannot switch from hauler to ${recommendedRole} (would leave < ${config.MIN_HAULERS} haulers)`,
                        );
                        recommendedRole = "hauler";
                    }
                }
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
        // Compute role stats once and pass into per-creep evaluation to avoid repeated work
        const stats = this.getRoleStats(room);
        for (var name in Game.creeps) {
            var creep = Game.creeps[name];
            if (creep.room === room) {
                this.evaluateCreep(creep, room, stats);
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
            miner: 0,
            hauler: 0,
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

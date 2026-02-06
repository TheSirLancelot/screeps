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
        if (
            creep.memory.fixedRole === true ||
            creep.memory.role === "miner" ||
            creep.memory.emergency === true
        ) {
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

            const roomLevel = room.controller ? room.controller.level : 0;

            // Level up harvesters to miners at RCL 3+ for better energy efficiency
            if (
                roomLevel >= 3 &&
                creep.memory.role === "harvester" &&
                creep.memory.emergency !== true
            ) {
                console.log(
                    `${creep.name}: upgrading from harvester to miner (RCL ${roomLevel})`,
                );
                creep.memory.role = "miner";
                creep.memory.fixedRole = true;
                // Assign to a source
                const sources = room.find(FIND_SOURCES);
                if (sources.length > 0) {
                    creep.memory.sourceId = sources[0].id;
                }
                return;
            }

            // EMERGENCY: If hostiles in room, everyone becomes hauler to keep towers full
            const hostiles = room.find(FIND_HOSTILE_CREEPS);
            if (
                roomLevel > 2 &&
                hostiles.length > 0 &&
                recommendedRole !== "hauler"
            ) {
                console.log(
                    `${creep.name}: EMERGENCY - forcing role to hauler (${hostiles.length} hostiles in room)`,
                );
                recommendedRole = "hauler";
            }

            // If population in this room is critically low, force haulers to prioritize energy
            let totalCreeps = 0;
            for (const cname in Game.creeps) {
                const c = Game.creeps[cname];
                if (c && c.room === room && !c.memory.targetRoom) {
                    totalCreeps += 1;
                }
            }
            if (
                roomLevel > 2 &&
                totalCreeps <= config.CRITICAL_CREEPS &&
                recommendedRole !== "hauler"
            ) {
                console.log(
                    `${creep.name}: forcing role to hauler (room population ${totalCreeps} <= ${config.CRITICAL_CREEPS})`,
                );
                recommendedRole = "hauler";
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

            // Ensure at least one repairer to maintain structures
            const repairers =
                roleStats && roleStats.repairer ? roleStats.repairer : 0;
            if (
                repairers < config.MIN_REPAIRERS &&
                recommendedRole !== "repairer"
            ) {
                console.log(
                    `${creep.name}: forcing role to repairer (repairers ${repairers} < ${config.MIN_REPAIRERS})`,
                );
                recommendedRole = "repairer";
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
                creep.memory.previousRole = creep.memory.role;
                creep.memory.role = recommendedRole;
                creep.memory.roleChangedAt = Game.time;
                creep.say(ROLE_ICONS[recommendedRole]);
            }
        }
    },

    /**
     * Assigns dedicated haulers to miners in a room
     * Deterministically pairs unassigned haulers with miners, one-to-one
     * @param {Room} room - The room to manage creeps in
     */
    assignHaulersToMiners: function (room) {
        // Find all miners with fixedRole: true
        const miners = Object.values(Game.creeps).filter(
            (c) =>
                c.room === room &&
                c.memory.role === "miner" &&
                c.memory.fixedRole === true,
        );

        // Find all dedicated haulers with fixedRole: true
        const haulers = Object.values(Game.creeps).filter(
            (c) =>
                c.room === room &&
                c.memory.role === "hauler" &&
                c.memory.fixedRole === true,
        );

        // Clear dead miner assignments from haulers
        for (const hauler of haulers) {
            if (hauler.memory.assignedMinerId) {
                const miner = Game.getObjectById(hauler.memory.assignedMinerId);
                if (!miner || miner.room !== room) {
                    hauler.memory.assignedMinerId = null;
                    hauler.memory.assignedContainerId = null;
                }
            }
        }

        // Sort miners and haulers by id for deterministic pairing
        miners.sort((a, b) => (a.id < b.id ? -1 : 1));
        haulers.sort((a, b) => (a.id < b.id ? -1 : 1));

        // Create a set of already assigned miner ids
        const assignedMinerIds = new Set();
        for (const hauler of haulers) {
            if (hauler.memory.assignedMinerId) {
                assignedMinerIds.add(hauler.memory.assignedMinerId);
            }
        }

        // Pair unassigned haulers with unassigned miners
        for (const hauler of haulers) {
            if (!hauler.memory.assignedMinerId) {
                // Find first unassigned miner
                for (const miner of miners) {
                    if (!assignedMinerIds.has(miner.id)) {
                        hauler.memory.assignedMinerId = miner.id;
                        assignedMinerIds.add(miner.id);
                        break;
                    }
                }
            }
        }
    },

    /**
     * Evaluates all creeps in a room and assigns roles
     * @param {Room} room - The room to manage creeps in
     */
    manageAllCreeps: function (room) {
        // Assign haulers to miners first (deterministically, once per tick)
        this.assignHaulersToMiners(room);

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

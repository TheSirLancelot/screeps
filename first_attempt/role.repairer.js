var roleRepairer = {
    /** @param {Creep} creep **/
    run: function (creep) {
        // Track previous repairing state to avoid spamming say
        const prevRepairing = creep.memory.repairing;

        if (creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.repairing = false;

            // TODO: If no energy from storage/containers available, add fallback behavior.
            var stores = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    (structure.structureType == STRUCTURE_STORAGE ||
                        structure.structureType == STRUCTURE_CONTAINER) &&
                    structure.store[RESOURCE_ENERGY] > 0,
            });
            var targets = stores;
            // find closest target that a path exists to
            var target = creep.pos.findClosestByPath(targets);
            if (!target) {
                return;
            }
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: "#ffaa00" },
                });
            }
        } else {
            creep.memory.repairing = true;

            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.hits < structure.hitsMax &&
                    structure.structureType != STRUCTURE_WALL,
            });
            // TODO: If no repair targets exist, add fallback behavior (upgrade, build, or rally).
            if (targets.length > 0) {
                // find closest target that a path exists to
                var target = creep.pos.findClosestByPath(targets);
                if (creep.repair(target) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffffff" },
                    });
                }
            }
        }

        // Announce state changes: 🔧 for repairing, ⛏️ for harvesting
        if (creep.memory.repairing === true && prevRepairing !== true) {
            creep.say("🔧");
        }
        if (creep.memory.repairing === false && prevRepairing !== false) {
            creep.say("⛏️");
        }
    },
};

module.exports = roleRepairer;

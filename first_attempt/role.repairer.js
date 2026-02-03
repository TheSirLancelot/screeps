var energySource = require("energy.source");

var roleRepairer = {
    /** @param {Creep} creep **/
    run: function (creep) {
        // Track previous repairing state to avoid spamming say
        const prevRepairing = creep.memory.repairing;

        if (creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.repairing = false;

            // Use committed energy source to prevent thrashing
            const target = energySource.findCommittedSource(creep);
            if (target) {
                energySource.collectFrom(creep, target);
            }
        } else {
            creep.memory.repairing = true;

            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.hits < structure.hitsMax &&
                    structure.structureType != STRUCTURE_WALL &&
                    structure.structureType != STRUCTURE_ROAD,
            });
            // TODO: If no repair targets exist, add fallback behavior (upgrade, build, or rally).
            if (targets.length > 0) {
                // find closest target that a path exists to
                var target = creep.pos.findClosestByPath(targets);
                if (creep.repair(target) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffffff" },
                        reusePath: 20,
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

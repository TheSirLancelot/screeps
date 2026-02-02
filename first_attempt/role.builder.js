var roleBuilder = {
    /** @param {Creep} creep **/
    run: function (creep) {
        // TODO: If no construction sites, add fallback work (upgrade controller, repair, or rally).
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
            creep.say("⛏️");
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) {
            creep.memory.building = true;
            creep.say("🚧");
        }

        if (creep.memory.building) {
            var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (targets.length) {
                var target = creep.pos.findClosestByPath(targets);
                if (target) {
                    if (creep.build(target) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffffff" },
                        });
                    }
                }
            }
        } else {
            // Get energy from storage/containers, or harvest from sources if none available
            var stores = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    (structure.structureType == STRUCTURE_STORAGE ||
                        structure.structureType == STRUCTURE_CONTAINER) &&
                    structure.store[RESOURCE_ENERGY] > 0,
            });

            var target = creep.pos.findClosestByPath(stores);

            // If no storage/containers with energy, harvest from source
            if (!target) {
                var sources = creep.room.find(FIND_SOURCES);
                target = creep.pos.findClosestByPath(sources);
                if (target) {
                    if (creep.harvest(target) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffaa00" },
                        });
                    }
                }
            } else {
                var result = creep.withdraw(target, RESOURCE_ENERGY);
                if (result == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                    });
                }
            }
        }
    },
};

module.exports = roleBuilder;

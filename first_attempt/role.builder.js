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
                            reusePath: 20,
                        });
                    }
                }
            }
        } else {
            // Get energy from storage first, then containers, then sources
            var storage = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.structureType == STRUCTURE_STORAGE &&
                    structure.store[RESOURCE_ENERGY] > 0,
            });

            var containers = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.structureType == STRUCTURE_CONTAINER &&
                    structure.store[RESOURCE_ENERGY] > 0,
            });

            var target = null;
            if (storage.length > 0) {
                target = creep.pos.findClosestByPath(storage);
            } else if (containers.length > 0) {
                target = creep.pos.findClosestByPath(containers);
            }

            if (target) {
                var result = creep.withdraw(target, RESOURCE_ENERGY);
                if (result == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                        reusePath: 20,
                    });
                }
            } else {
                // If no storage/containers with energy, harvest from source
                var sources = creep.room.find(FIND_SOURCES);
                target = creep.pos.findClosestByPath(sources);
                if (target) {
                    if (creep.harvest(target) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffaa00" },
                            reusePath: 20,
                        });
                    }
                }
            }
        }
    },
};

module.exports = roleBuilder;

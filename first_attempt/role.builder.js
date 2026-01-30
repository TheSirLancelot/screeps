var roleBuilder = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
            creep.say("🔄 harvest");
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) {
            creep.memory.building = true;
            creep.say("🚧 build");
        }

        if (creep.memory.building) {
            var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (targets.length) {
                if (creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {
                        visualizePathStyle: { stroke: "#ffffff" },
                    });
                }
            } else {
                var builders = _.filter(
                    Game.creeps,
                    (creep) => creep.memory.role == "builder",
                );
                if (builders.length > 1) {
                    creep.memory["role"] = "harvester";
                }
            }
        } else {
            var sources = creep.room.find(FIND_SOURCES);
            var stores = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    (structure.structureType == STRUCTURE_CONTAINER ||
                        structure.structureType == STRUCTURE_STORAGE) &&
                    structure.store[RESOURCE_ENERGY] > 0,
            });
            var targets = sources.concat(stores);
            // find closest target that a path exists to
            var target = creep.pos.findClosestByPath(targets);
            if (!target) {
                return;
            }
            if (target.structureType) {
                var result = creep.withdraw(target, RESOURCE_ENERGY);
                if (result == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                    });
                }
            } else if (creep.harvest(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: "#ffaa00" },
                });
            }
        }
    },
};

module.exports = roleBuilder;

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
                if (creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {
                        visualizePathStyle: { stroke: "#ffffff" },
                    });
                }
            }
        } else {
            // TODO: If no energy from storage/containers available, set a fallback behavior.
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
                console.log(
                    "Builder creep found no energy in storage/containers!",
                );
                return;
            }
            var result = creep.withdraw(target, RESOURCE_ENERGY);
            if (result == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: "#ffaa00" },
                });
            }
        }
    },
};

module.exports = roleBuilder;

var roleHarvester = {
    /** @param {Creep} creep **/
    run: function (creep) {
        // track previous state to avoid spamming say
        const prevHarvesting = creep.memory.harvesting;
        if (creep.memory.harvesting === undefined) {
            creep.memory.harvesting = creep.store[RESOURCE_ENERGY] == 0;
        }
        if (creep.memory.harvesting && creep.store.getFreeCapacity() == 0) {
            creep.memory.harvesting = false;
        }
        if (!creep.memory.harvesting && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.harvesting = true;
        }

        // Announce when switching into harvesting
        if (creep.memory.harvesting === true && prevHarvesting !== true) {
            creep.say("⛏️");
        }

        if (creep.memory.harvesting) {
            // find closest source that a path exists to
            var sources = creep.room.find(FIND_SOURCES);
            target = creep.pos.findClosestByPath(sources);
            if (creep.harvest(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: "#ffaa00" },
                });
            }
        } else {
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (
                        (structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_TOWER ||
                            structure.structureType == STRUCTURE_CONTAINER) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                    );
                },
            });
            if (targets.length == 0) {
                // take the energy to the controller
                targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return structure.structureType == STRUCTURE_CONTROLLER;
                    },
                });
            }
            while (targets.length > 0 && creep.store[RESOURCE_ENERGY] > 0) {
                // get closest target to transfer to
                var target = creep.pos.findClosestByPath(targets);
                if (!target) {
                    break;
                }
                if (
                    target.store &&
                    target.store.getFreeCapacity(RESOURCE_ENERGY) == 0
                ) {
                    targets = targets.filter(
                        (structure) => structure.id != target.id,
                    );
                    continue;
                }
                var result = creep.transfer(target, RESOURCE_ENERGY);
                if (result == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffffff" },
                    });
                    break;
                }
                if (result == OK) {
                    break;
                }
                if (result == ERR_FULL || result == ERR_INVALID_TARGET) {
                    targets = targets.filter(
                        (structure) => structure.id != target.id,
                    );
                    continue;
                }
                break;
            }
        }
    },
};

module.exports = roleHarvester;

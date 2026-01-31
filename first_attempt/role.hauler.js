var roleHauler = {
    /** @param {Creep} creep **/
    run: function (creep) {
        // track previous state to avoid spamming say
        const prevHauling = creep.memory.hauling;
        if (creep.memory.hauling === undefined) {
            creep.memory.hauling = creep.store[RESOURCE_ENERGY] == 0;
        }
        if (creep.memory.hauling && creep.store.getFreeCapacity() == 0) {
            creep.memory.hauling = false;
        }
        if (!creep.memory.hauling && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.hauling = true;
        }

        // Announce when switching into hauling
        if (creep.memory.hauling === true && prevHauling !== true) {
            creep.say("📦");
        }

        if (creep.memory.hauling) {
            // Get energy from storage
            var storage = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.structureType === STRUCTURE_STORAGE &&
                    structure.store[RESOURCE_ENERGY] > 0,
            });

            if (storage.length > 0) {
                var target = storage[0];
                if (
                    creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                    });
                }
            }
        } else {
            // Deliver energy to structures that need it
            // Priority: Spawn > Extensions > Tower > Containers > Controller

            var targets = [];

            // Priority 1: Spawns
            var spawns = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (
                        structure.structureType == STRUCTURE_SPAWN &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                    );
                },
            });
            if (spawns.length > 0) {
                targets = spawns;
            } else {
                // Priority 2: Extensions
                var extensions = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (
                            structure.structureType == STRUCTURE_EXTENSION &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                        );
                    },
                });
                if (extensions.length > 0) {
                    targets = extensions;
                } else {
                    // Priority 3: Towers
                    var towers = creep.room.find(FIND_STRUCTURES, {
                        filter: (structure) => {
                            return (
                                structure.structureType == STRUCTURE_TOWER &&
                                structure.store.getFreeCapacity(
                                    RESOURCE_ENERGY,
                                ) > 0
                            );
                        },
                    });
                    if (towers.length > 0) {
                        targets = towers;
                    } else {
                        // Priority 4: Containers
                        var containers = creep.room.find(FIND_STRUCTURES, {
                            filter: (structure) => {
                                return (
                                    structure.structureType ==
                                        STRUCTURE_CONTAINER &&
                                    structure.store.getFreeCapacity(
                                        RESOURCE_ENERGY,
                                    ) > 0
                                );
                            },
                        });
                        if (containers.length > 0) {
                            targets = containers;
                        } else {
                            // Priority 5: Controller (upgrade)
                            if (
                                creep.room.controller &&
                                creep.room.controller.my
                            ) {
                                targets = [creep.room.controller];
                            }
                        }
                    }
                }
            }

            if (targets.length > 0) {
                // Get closest target to transfer to
                var target = creep.pos.findClosestByPath(targets);
                if (!target) {
                    return;
                }
                if (target.structureType === STRUCTURE_CONTROLLER) {
                    // Upgrade controller
                    if (creep.upgradeController(target) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffffff" },
                        });
                    }
                } else {
                    // Transfer energy
                    var result = creep.transfer(target, RESOURCE_ENERGY);
                    if (result == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffffff" },
                        });
                    }
                }
            }
        }
    },
};

module.exports = roleHauler;

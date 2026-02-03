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
            // Priority 1: Get energy from containers (to keep them from filling up)
            // Priority 2: Get energy from storage (main hauling distribution)
            var target = null;

            // If hauler has a committed container, try to use it first (avoid thrashing)
            if (creep.memory.haulerSourceId) {
                const committedTarget = Game.getObjectById(
                    creep.memory.haulerSourceId,
                );
                if (
                    committedTarget &&
                    committedTarget.structureType === STRUCTURE_CONTAINER &&
                    committedTarget.store[RESOURCE_ENERGY] > 0
                ) {
                    target = committedTarget;
                }
            }

            // If committed target is gone/empty, find a new one
            if (!target) {
                var containers = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.structureType === STRUCTURE_CONTAINER &&
                        structure.store[RESOURCE_ENERGY] > 0,
                });

                if (containers.length > 0) {
                    target = creep.pos.findClosestByPath(containers);
                } else {
                    var storage = creep.room.find(FIND_STRUCTURES, {
                        filter: (structure) =>
                            structure.structureType === STRUCTURE_STORAGE &&
                            structure.store[RESOURCE_ENERGY] > 0,
                    });
                    if (storage.length > 0) {
                        target = storage[0];
                    }
                }
            }

            if (target) {
                creep.memory.haulerSourceType = target.structureType;
                creep.memory.haulerSourceId = target.id;
                if (
                    creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                        reusePath: 5,
                    });
                }
            }
        } else {
            // Deliver energy with fixed priority: Spawns > Extensions > Towers > Storage > Controller
            // This ensures spawns are always ready to spawn new creeps
            var targets = [];

            // Priority 1: Spawns (always fill spawns first so we can spawn immediately)
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
                        // Priority 4: Storage
                        var storage = creep.room.find(FIND_STRUCTURES, {
                            filter: (structure) =>
                                structure.structureType === STRUCTURE_STORAGE &&
                                structure.store.getFreeCapacity(
                                    RESOURCE_ENERGY,
                                ) > 0,
                        });
                        if (storage.length > 0) {
                            targets = storage;
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
                            reusePath: 5,
                        });
                    }
                } else {
                    // Transfer energy
                    var result = creep.transfer(target, RESOURCE_ENERGY);
                    if (result == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffffff" },
                            reusePath: 5,
                        });
                    }
                }
            }
        }
    },
};

module.exports = roleHauler;

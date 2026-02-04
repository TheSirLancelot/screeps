var roleHauler = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.memory.hauling === undefined) {
            creep.memory.hauling = true;
        }

        if (creep.memory.hauling && creep.store.getFreeCapacity() === 0) {
            creep.memory.hauling = false;
        }
        if (!creep.memory.hauling && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.hauling = true;
        }

        if (creep.memory.hauling) {
            // Priority 1: Dropped energy (temporary, disappears fast)
            var target = null;

            var dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
                filter: (resource) => resource.resourceType === RESOURCE_ENERGY,
            });
            if (dropped.length > 0) {
                target = creep.pos.findClosestByPath(dropped);
                if (target && creep.pickup(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                        reusePath: 20,
                    });
                }
                return;
            }

            // Priority 2: Tombstones (temporary, disappear after 5 ticks)
            var tombstones = creep.room.find(FIND_TOMBSTONES, {
                filter: (tombstone) => tombstone.store[RESOURCE_ENERGY] > 0,
            });
            if (tombstones.length > 0) {
                target = creep.pos.findClosestByPath(tombstones);
                if (
                    target &&
                    creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                        reusePath: 20,
                    });
                }
                return;
            }

            // Priority 3: If assigned to a miner, work only with containers at that miner's location
            if (creep.memory.assignedMinerId) {
                const assignedMiner = Game.getObjectById(
                    creep.memory.assignedMinerId,
                );
                if (!assignedMiner) {
                    // Miner is dead, clear assignment
                    creep.memory.assignedMinerId = null;
                    creep.memory.assignedContainerId = null;
                } else {
                    // Find container within range 1 of the assigned miner
                    const nearbyContainers = assignedMiner.pos.findInRange(
                        FIND_STRUCTURES,
                        1,
                        {
                            filter: (s) =>
                                s.structureType === STRUCTURE_CONTAINER,
                        },
                    );

                    if (nearbyContainers.length > 0) {
                        // Pick one with energy, or go wait by the first one
                        const containerWithEnergy = nearbyContainers.find(
                            (c) => c.store[RESOURCE_ENERGY] > 0,
                        );
                        target = containerWithEnergy || nearbyContainers[0];

                        if (
                            target &&
                            creep.withdraw(target, RESOURCE_ENERGY) ===
                                ERR_NOT_IN_RANGE
                        ) {
                            creep.moveTo(target, {
                                visualizePathStyle: { stroke: "#ffaa00" },
                                reusePath: 20,
                            });
                        }
                        return;
                    }
                }
            }

            // No assigned miner: fallback to any containers > storage
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
                    target = creep.pos.findClosestByPath(storage);
                }
            }

            if (
                target &&
                creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE
            ) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: "#ffaa00" },
                    reusePath: 20,
                });
            }
        } else {
            // Deliver energy with fixed priority: Spawns > Extensions > Towers > Storage > Controller
            var targets = [];

            var spawns = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.structureType === STRUCTURE_SPAWN &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            });
            if (spawns.length > 0) {
                targets = spawns;
            } else {
                var extensions = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.structureType === STRUCTURE_EXTENSION &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
                });
                if (extensions.length > 0) {
                    targets = extensions;
                } else {
                    var towers = creep.room.find(FIND_STRUCTURES, {
                        filter: (structure) =>
                            structure.structureType === STRUCTURE_TOWER &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) >
                                0,
                    });
                    if (towers.length > 0) {
                        targets = towers;
                    } else {
                        var storage = creep.room.find(FIND_STRUCTURES, {
                            filter: (structure) =>
                                structure.structureType === STRUCTURE_STORAGE &&
                                structure.store.getFreeCapacity(
                                    RESOURCE_ENERGY,
                                ) > 0,
                        });
                        if (storage.length > 0) {
                            targets = storage;
                        } else if (
                            creep.room.controller &&
                            creep.room.controller.my
                        ) {
                            targets = [creep.room.controller];
                        }
                    }
                }
            }

            if (targets.length > 0) {
                var target = creep.pos.findClosestByPath(targets);
                if (!target) {
                    return;
                }

                if (target.structureType === STRUCTURE_CONTROLLER) {
                    if (creep.upgradeController(target) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffffff" },
                            reusePath: 20,
                        });
                    }
                } else if (
                    creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffffff" },
                        reusePath: 20,
                    });
                }
            }
        }
    },
};

module.exports = roleHauler;

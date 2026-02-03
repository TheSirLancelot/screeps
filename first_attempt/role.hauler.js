var roleHauler = {
    /** @param {Creep} creep **/
    run: function (creep) {
        // Remote hauler logic: navigate between home room and target room
        const targetRoom = creep.memory.targetRoom;
        const homeRoom = creep.memory.homeRoom || creep.room.name;

        if (!creep.memory.homeRoom) {
            creep.memory.homeRoom = creep.room.name;
        }

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

        // Remote hauler: if hauling (empty), go to target room; if delivering (full), go to home room
        if (targetRoom) {
            if (creep.memory.hauling && creep.room.name !== targetRoom) {
                const targetPos = new RoomPosition(25, 25, targetRoom);
                creep.moveTo(targetPos, {
                    visualizePathStyle: { stroke: "#ffaa00" },
                    reusePath: 50,
                });
                return;
            } else if (!creep.memory.hauling && creep.room.name !== homeRoom) {
                const homePos = new RoomPosition(25, 25, homeRoom);
                creep.moveTo(homePos, {
                    visualizePathStyle: { stroke: "#ffffff" },
                    reusePath: 50,
                });
                return;
            }
        }

        if (creep.memory.hauling) {
            // Hauler assignment strategy:
            // 1. Tombstones (always priority - they disappear fast)
            // 2. Assigned container (stay there until hauler is FULL, as long as miner is active)
            // 3. Storage as fallback
            var target = null;
            const isDedicatedHauler = creep.memory.fixedRole === true;

            // Check for tombstones first (highest priority - they disappear)
            var tombstones = creep.room.find(FIND_TOMBSTONES, {
                filter: (tombstone) =>
                    tombstone.store[RESOURCE_ENERGY] > 0 &&
                    tombstone.creep &&
                    tombstone.creep.my === true,
            });

            if (tombstones.length > 0) {
                target = creep.pos.findClosestByPath(tombstones);
            }

            // If no tombstone, find any available container with energy and active miner
            if (!target) {
                // Get all dedicated haulers and their assignments
                const dedicatedHaulers = creep.room.find(FIND_MY_CREEPS, {
                    filter: (c) =>
                        c.memory.role === "hauler" &&
                        c.memory.fixedRole === true &&
                        c.memory.assignedContainerId,
                });
                const assignedContainerIds = dedicatedHaulers.map(
                    (h) => h.memory.assignedContainerId,
                );

                // Find containers with active miners (any of them, don't restrict to assignment)
                var containers = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        if (structure.structureType !== STRUCTURE_CONTAINER)
                            return false;
                        if (structure.store[RESOURCE_ENERGY] === 0)
                            return false;

                        // Check for miner nearby
                        const minersNearby = structure.pos.findInRange(
                            FIND_MY_CREEPS,
                            1,
                            { filter: (c) => c.memory.role === "miner" },
                        );
                        return minersNearby.length > 0;
                    },
                });

                if (containers.length > 0) {
                    // Non-dedicated haulers must avoid dedicated assignments
                    const availableContainers = containers.filter(
                        (c) => !assignedContainerIds.includes(c.id),
                    );

                    if (availableContainers.length > 0) {
                        // Pick the fullest available container
                        target = availableContainers.reduce(
                            (fullest, container) => {
                                return container.store[RESOURCE_ENERGY] >
                                    fullest.store[RESOURCE_ENERGY]
                                    ? container
                                    : fullest;
                            },
                        );
                    } else if (isDedicatedHauler && containers.length > 0) {
                        // Dedicated haulers can work on their own assigned containers
                        target = containers.reduce((fullest, container) => {
                            return container.store[RESOURCE_ENERGY] >
                                fullest.store[RESOURCE_ENERGY]
                                ? container
                                : fullest;
                        });
                    }

                    // Update assignment if picked a different container
                    if (
                        target &&
                        isDedicatedHauler &&
                        target.id !== creep.memory.assignedContainerId
                    ) {
                        creep.memory.assignedContainerId = target.id;
                    }
                }

                if (!target) {
                    // No containers with miners, try storage
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
                if (target.structureType === STRUCTURE_STORAGE) {
                    const hasEnergyDemand =
                        creep.room.find(FIND_STRUCTURES, {
                            filter: (structure) =>
                                (structure.structureType === STRUCTURE_SPAWN ||
                                    structure.structureType ===
                                        STRUCTURE_EXTENSION ||
                                    structure.structureType ===
                                        STRUCTURE_TOWER) &&
                                structure.store.getFreeCapacity(
                                    RESOURCE_ENERGY,
                                ) > 0,
                        }).length > 0;

                    if (!hasEnergyDemand) {
                        if (creep.memory.fixedRole !== true) {
                            if (Game.time % 50 === 0) {
                                console.log(
                                    `${creep.name} switching to upgrader (no hauler demand)`,
                                );
                            }
                            creep.memory.role = "upgrader";
                        }
                        return;
                    }
                }
                if (
                    creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                        reusePath: 20,
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
                            reusePath: 20,
                        });
                    }
                } else {
                    // Transfer energy
                    var result = creep.transfer(target, RESOURCE_ENERGY);
                    if (result == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffffff" },
                            reusePath: 20,
                        });
                    }
                }
            }
        }
    },
};

module.exports = roleHauler;

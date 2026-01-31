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
            // TODO: Prefer non-empty sources and move toward empty ones to pre-position.
            if (creep.harvest(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: "#ffaa00" },
                });
            }
        } else {
            // Initialize room memory for tower tracking if needed
            if (creep.room.memory.towerBeingServiced === undefined) {
                creep.room.memory.towerBeingServiced = false;
            }
            if (creep.room.memory.towerServicedBy === undefined) {
                creep.room.memory.towerServicedBy = null;
            }

            // Prioritize towers first for defense
            var towers = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (
                        structure.structureType == STRUCTURE_TOWER &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                    );
                },
            });

            // Check if tower is above 50% AND already being serviced by another harvester
            var skipTower = false;
            if (towers.length > 0) {
                const tower = towers[0]; //TODO: handle multiple towers
                const towerPercent =
                    tower.store[RESOURCE_ENERGY] /
                    tower.store.getCapacity(RESOURCE_ENERGY);

                // Skip tower only if above 50% AND another harvester is already servicing it
                if (
                    towerPercent > 0.5 &&
                    creep.room.memory.towerBeingServiced &&
                    creep.memory.servicingTower !== true
                ) {
                    skipTower = true;
                }
            }

            var targets;
            if (towers.length > 0 && !skipTower) {
                targets = towers;
                // Mark that this creep is servicing the tower
                creep.memory.servicingTower = true;
                creep.room.memory.towerBeingServiced = true;
                creep.room.memory.towerServicedBy = creep.name;
            } else {
                // Clear servicing flag if not targeting tower
                if (creep.memory.servicingTower) {
                    creep.memory.servicingTower = false;
                    if (creep.room.memory.towerServicedBy === creep.name) {
                        creep.room.memory.towerBeingServiced = false;
                        creep.room.memory.towerServicedBy = null;
                    }
                }

                // Then spawns
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
                    // Then extensions
                    var extensions = creep.room.find(FIND_STRUCTURES, {
                        filter: (structure) => {
                            return (
                                structure.structureType ==
                                    STRUCTURE_EXTENSION &&
                                structure.store.getFreeCapacity(
                                    RESOURCE_ENERGY,
                                ) > 0
                            );
                        },
                    });
                    if (extensions.length > 0) {
                        targets = extensions;
                    } else {
                        // Finally containers
                        targets = creep.room.find(FIND_STRUCTURES, {
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
                    }
                }
            }

            if (targets.length == 0) {
                // TODO: FIX - controller is not a structure in FIND_STRUCTURES; use room.controller fallback.
                // take the energy to the controller
                targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return structure.structureType == STRUCTURE_CONTROLLER;
                    },
                });
            }
            // TODO: If no transfer targets exist, add fallback (upgrade controller or move to rally).
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
                    if (target.structureType == STRUCTURE_TOWER) {
                        if (creep.room.memory.towerServicedBy === creep.name) {
                            creep.room.memory.towerBeingServiced = false;
                            creep.room.memory.towerServicedBy = null;
                        }
                        creep.memory.servicingTower = false;
                    }
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

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
            // Assign a source per creep so they spread out, retarget if empty
            var allSources = creep.room.find(FIND_SOURCES);
            var target = creep.memory.sourceId
                ? Game.getObjectById(creep.memory.sourceId)
                : null;

            if (!target || target.energy === 0) {
                var availableSources = allSources.filter(
                    (source) => source.energy > 0,
                );
                var pickFrom =
                    availableSources.length > 0 ? availableSources : allSources;

                if (pickFrom.length > 0) {
                    let hash = 0;
                    for (let i = 0; i < creep.name.length; i += 1) {
                        hash = (hash * 31 + creep.name.charCodeAt(i)) >>> 0;
                    }
                    const index = hash % pickFrom.length;
                    target = pickFrom[index];
                    creep.memory.sourceId = target.id;
                }
            }

            if (target) {
                const harvestResult = creep.harvest(target);
                if (harvestResult == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                        reusePath: 5,
                    });
                }
            }
        } else {
            // Deliver energy priority: Containers > Storage > Spawn > Extensions > Tower > Controller
            var targets = [];

            // Priority 1: Containers (to store harvested energy)
            var containers = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.structureType == STRUCTURE_CONTAINER &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            });
            if (containers.length > 0) {
                targets = containers;
            } else {
                // Priority 2: Storage (if containers are full)
                var storage = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.structureType == STRUCTURE_STORAGE &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
                });
                if (storage.length > 0) {
                    targets = storage;
                }
            }

            // Fallback if containers and storage are full: Spawn > Extensions > Tower > Controller
            if (targets.length === 0) {
                // Priority 3: Spawns
                var spawns = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.structureType == STRUCTURE_SPAWN &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
                });
                if (spawns.length > 0) {
                    targets = spawns;
                } else {
                    // Priority 4: Extensions
                    var extensions = creep.room.find(FIND_STRUCTURES, {
                        filter: (structure) =>
                            structure.structureType == STRUCTURE_EXTENSION &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) >
                                0,
                    });
                    if (extensions.length > 0) {
                        targets = extensions;
                    } else {
                        // Priority 5: Towers
                        var towers = creep.room.find(FIND_STRUCTURES, {
                            filter: (structure) =>
                                structure.structureType == STRUCTURE_TOWER &&
                                structure.store.getFreeCapacity(
                                    RESOURCE_ENERGY,
                                ) > 0,
                        });
                        if (towers.length > 0) {
                            targets = towers;
                        } else {
                            // Priority 6: Controller (upgrade)
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
                var target = creep.pos.findClosestByPath(targets);
                if (target) {
                    if (target.structureType === STRUCTURE_CONTROLLER) {
                        // Upgrade controller
                        if (
                            creep.upgradeController(target) == ERR_NOT_IN_RANGE
                        ) {
                            creep.moveTo(target, {
                                visualizePathStyle: {
                                    stroke: "#ffffff",
                                },
                                reusePath: 5,
                            });
                        }
                    } else {
                        // Transfer energy
                        if (
                            creep.transfer(target, RESOURCE_ENERGY) ==
                            ERR_NOT_IN_RANGE
                        ) {
                            creep.moveTo(target, {
                                visualizePathStyle: {
                                    stroke: "#ffffff",
                                },
                                reusePath: 5,
                            });
                        }
                    }
                }
            }
        }
    },
};

module.exports = roleHarvester;

/**
 * Role: Remote Repairer
 * Repairs damaged structures in remote rooms (containers, roads, walls)
 *
 * CONSOLE COMMANDS TO USE:
 *
 * 1. Spawn a remote repairer (replace room/spawn names):
 *    Game.spawns['Spawn1'].spawnCreep([WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], 'RemoteRepairer1', {memory: {role: 'remote_repairer', targetRoom: 'W1N1', fixedRole: true}});
 *
 * Note: This role auto-repairs damaged structures in priority order:
 * 1. Containers (critical for mining operations)
 * 2. Roads (for creep movement)
 * 3. Other structures
 */

var roleRemoteRepairer = {
    /** @param {Creep} creep **/
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        if (!targetRoom) {
            console.log(`Remote repairer ${creep.name} has no targetRoom set!`);
            return;
        }

        // Track repairing state
        if (creep.memory.repairing && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.repairing = false;
            creep.say("⛏️");
        }
        if (!creep.memory.repairing && creep.store.getFreeCapacity() === 0) {
            creep.memory.repairing = true;
            creep.say("🔧");
        }

        // Navigate to target room if not there
        if (creep.room.name !== targetRoom) {
            const targetPos = new RoomPosition(25, 25, targetRoom);
            creep.moveTo(targetPos, {
                visualizePathStyle: { stroke: "#ff00ff" },
                reusePath: 50,
            });
            return;
        }

        // If repairing, find damaged structures and repair them
        if (creep.memory.repairing) {
            let target = null;

            // Priority 1: Damaged containers (critical for mining)
            const damagedContainers = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.structureType === STRUCTURE_CONTAINER &&
                    structure.hits < structure.hitsMax,
            });

            if (damagedContainers.length > 0) {
                // Prioritize containers with lowest health
                target = damagedContainers.reduce((lowest, container) => {
                    return container.hits < lowest.hits ? container : lowest;
                });
            }

            // Priority 2: Damaged roads from the original path plan
            if (!target) {
                const remoteRoomName = creep.memory.targetRoom;
                const roadPlan =
                    Memory.remoteRoadPlans &&
                    Memory.remoteRoadPlans[remoteRoomName];

                if (roadPlan && roadPlan.length > 0) {
                    const damagedRoads = creep.room.find(FIND_STRUCTURES, {
                        filter: (structure) =>
                            structure.structureType === STRUCTURE_ROAD &&
                            structure.hits < structure.hitsMax &&
                            roadPlan.some(
                                (pos) =>
                                    pos.x === structure.pos.x &&
                                    pos.y === structure.pos.y,
                            ),
                    });

                    if (damagedRoads.length > 0) {
                        target = damagedRoads.reduce((lowest, road) => {
                            return road.hits < lowest.hits ? road : lowest;
                        });
                    }
                }
            }

            // Priority 3: Other damaged structures
            if (!target) {
                const damagedStructures = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.hits < structure.hitsMax &&
                        structure.structureType !== STRUCTURE_CONTROLLER &&
                        structure.structureType !== STRUCTURE_RAMPART,
                });

                if (damagedStructures.length > 0) {
                    target = damagedStructures.reduce((lowest, structure) => {
                        return structure.hits < lowest.hits
                            ? structure
                            : lowest;
                    });
                }
            }

            if (target) {
                if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ff00ff" },
                        reusePath: 20,
                    });
                }
                return;
            } else {
                // No more damaged structures, switch to gathering
                creep.memory.repairing = false;
                creep.say("⛏️");
            }
        }

        // Gathering energy with same priority as remote builder
        if (creep.store.getFreeCapacity() > 0) {
            // First check for tombstones (highest priority)
            const tombstones = creep.room.find(FIND_TOMBSTONES, {
                filter: (tombstone) =>
                    tombstone.store[RESOURCE_ENERGY] > 0 &&
                    tombstone.creep &&
                    tombstone.creep.my === true,
            });

            if (tombstones.length > 0) {
                const target = creep.pos.findClosestByPath(tombstones);
                if (target) {
                    if (
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

            // Check for dropped energy
            const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
                filter: (resource) =>
                    resource.resourceType === RESOURCE_ENERGY &&
                    resource.amount > 50,
            });

            if (droppedEnergy.length > 0) {
                const target = creep.pos.findClosestByPath(droppedEnergy);
                if (target) {
                    if (creep.pickup(target) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffaa00" },
                            reusePath: 20,
                        });
                    }
                    return;
                }
            }

            // Check for ruins with energy
            const ruinsWithEnergy = creep.room.find(FIND_RUINS, {
                filter: (ruin) => ruin.store[RESOURCE_ENERGY] > 0,
            });

            if (ruinsWithEnergy.length > 0) {
                const target = creep.pos.findClosestByPath(ruinsWithEnergy);
                if (target) {
                    if (
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

            // Check for nearby containers
            const nearbyContainers = creep.pos.findInRange(
                FIND_STRUCTURES,
                10,
                {
                    filter: (s) =>
                        s.structureType === STRUCTURE_CONTAINER &&
                        s.store[RESOURCE_ENERGY] > 0,
                },
            );

            if (nearbyContainers.length > 0) {
                const target = creep.pos.findClosestByRange(nearbyContainers);
                if (target) {
                    if (
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

            // Check for nearby sources
            const nearbySources = creep.pos.findInRange(FIND_SOURCES, 10);
            if (nearbySources.length > 0) {
                const target = creep.pos.findClosestByRange(nearbySources);
                if (target) {
                    if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffaa00" },
                            reusePath: 20,
                        });
                    }
                    return;
                }
            }

            // Fallback: find any source
            const allSources = creep.room.find(FIND_SOURCES);
            if (allSources.length > 0) {
                const target = creep.pos.findClosestByPath(allSources);
                if (target) {
                    if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
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

module.exports = roleRemoteRepairer;

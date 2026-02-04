/**
 * Role: Remote Builder
 * Builds containers at remote sources and lays basic roads
 *
 * CONSOLE COMMANDS TO USE:
 *
 * 1. Spawn a remote builder (replace room/spawn names):
 *    Game.spawns['Spawn1'].spawnCreep([WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], 'RemoteBuilder1', {memory: {role: 'remote_builder', targetRoom: 'W1N1', fixedRole: true}});
 *
 * 2. Optional: spawn a second builder if there are multiple sources
 *
 * Note: This role auto-creates container sites near sources and road plans from exits to sources.
 */

var energySource = require("energy.source");

function getRoadPlanForSource(room, source) {
    Memory.remoteRoadPlans = Memory.remoteRoadPlans || {};
    Memory.remoteRoadPlans[room.name] = Memory.remoteRoadPlans[room.name] || {};

    const existing = Memory.remoteRoadPlans[room.name][source.id];
    if (existing) {
        return existing;
    }

    const exits = room.find(FIND_EXIT);
    if (exits.length === 0) {
        return null;
    }

    const exitPos = source.pos.findClosestByRange(exits);
    if (!exitPos) {
        return null;
    }

    const result = PathFinder.search(
        source.pos,
        { pos: exitPos, range: 0 },
        { maxRooms: 1, plainCost: 2, swampCost: 10 },
    );

    const path = result.path.map((pos) => ({ x: pos.x, y: pos.y }));
    Memory.remoteRoadPlans[room.name][source.id] = path;
    return path;
}

var roleRemoteBuilder = {
    /** @param {Creep} creep **/
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        if (!targetRoom) {
            console.log(`Remote builder ${creep.name} has no targetRoom set!`);
            return;
        }

        if (creep.memory.building && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.building = false;
            creep.say("⛏️");
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() === 0) {
            creep.memory.building = true;
            creep.say("🚧");
        }

        if (creep.room.name !== targetRoom) {
            const targetPos = new RoomPosition(25, 25, targetRoom);
            creep.moveTo(targetPos, {
                visualizePathStyle: { stroke: "#00ffff" },
                reusePath: 50,
            });
            return;
        }

        if (creep.memory.building) {
            const assignedSource = creep.memory.assignedSourceId
                ? Game.getObjectById(creep.memory.assignedSourceId)
                : null;
            const assignedRoadPlan = assignedSource
                ? getRoadPlanForSource(creep.room, assignedSource)
                : null;
            let sites = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (sites.length === 0) {
                const terrain = Game.map.getRoomTerrain(creep.room.name);
                // Always check all sources for container placement, not just assigned one
                const sources = creep.room.find(FIND_SOURCES);

                // Place as many containers as possible around each source
                for (const source of sources) {
                    const nearbyContainers = source.pos.findInRange(
                        FIND_STRUCTURES,
                        1,
                        {
                            filter: (s) =>
                                s.structureType === STRUCTURE_CONTAINER,
                        },
                    );
                    const nearbySites = source.pos.findInRange(
                        FIND_CONSTRUCTION_SITES,
                        1,
                        {
                            filter: (s) =>
                                s.structureType === STRUCTURE_CONTAINER,
                        },
                    );

                    const totalContainers =
                        nearbyContainers.length + nearbySites.length;

                    // Try to place containers in all valid spots around the source
                    for (let dx = -1; dx <= 1; dx += 1) {
                        for (let dy = -1; dy <= 1; dy += 1) {
                            if (dx === 0 && dy === 0) continue;

                            // Stop if we've reached the construction site limit
                            const currentSites = creep.room.find(
                                FIND_CONSTRUCTION_SITES,
                            ).length;
                            if (currentSites >= 5) {
                                break;
                            }

                            const x = source.pos.x + dx;
                            const y = source.pos.y + dy;
                            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                            if (terrain.get(x, y) === TERRAIN_MASK_WALL)
                                continue;

                            const structures = creep.room.lookForAt(
                                LOOK_STRUCTURES,
                                x,
                                y,
                            );
                            const siteAt = creep.room.lookForAt(
                                LOOK_CONSTRUCTION_SITES,
                                x,
                                y,
                            );
                            if (structures.length > 0 || siteAt.length > 0) {
                                continue;
                            }

                            const pos = new RoomPosition(x, y, creep.room.name);
                            const result = creep.room.createConstructionSite(
                                pos,
                                STRUCTURE_CONTAINER,
                            );
                        }
                    }
                }

                sites = creep.room.find(FIND_CONSTRUCTION_SITES);
                if (sites.length === 0) {
                    let createdSites = 0;
                    const maxCreate = 5;

                    for (const source of sources) {
                        const roadPlan = getRoadPlanForSource(
                            creep.room,
                            source,
                        );
                        if (!roadPlan) {
                            continue;
                        }

                        for (const step of roadPlan) {
                            if (createdSites >= maxCreate) {
                                break;
                            }

                            const x = step.x;
                            const y = step.y;
                            const structures = creep.room.lookForAt(
                                LOOK_STRUCTURES,
                                x,
                                y,
                            );
                            const sitesAt = creep.room.lookForAt(
                                LOOK_CONSTRUCTION_SITES,
                                x,
                                y,
                            );
                            const hasRoad = structures.some(
                                (s) => s.structureType === STRUCTURE_ROAD,
                            );
                            const hasRoadSite = sitesAt.some(
                                (s) => s.structureType === STRUCTURE_ROAD,
                            );

                            if (!hasRoad && !hasRoadSite) {
                                const pos = new RoomPosition(
                                    x,
                                    y,
                                    creep.room.name,
                                );
                                const result =
                                    creep.room.createConstructionSite(
                                        pos,
                                        STRUCTURE_ROAD,
                                    );
                                if (result === OK) {
                                    createdSites += 1;
                                }
                            }
                        }
                    }
                }
            }

            sites = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (sites.length > 0) {
                // Prioritize containers over roads
                let target = null;
                const containerSites = sites.filter(
                    (s) => s.structureType === STRUCTURE_CONTAINER,
                );
                if (containerSites.length > 0) {
                    target = creep.pos.findClosestByPath(containerSites);
                }

                if (!target) {
                    target = creep.pos.findClosestByPath(sites);
                }

                if (target && creep.build(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffffff" },
                        reusePath: 20,
                    });
                }
            } else if (creep.store[RESOURCE_ENERGY] > 0) {
                // No construction sites: repair nearby structures instead
                let repairTarget = null;

                const damagedContainers = creep.room.find(FIND_STRUCTURES, {
                    filter: (s) =>
                        s.structureType === STRUCTURE_CONTAINER &&
                        s.hits < s.hitsMax,
                });
                if (damagedContainers.length > 0) {
                    repairTarget =
                        creep.pos.findClosestByPath(damagedContainers);
                }

                if (!repairTarget) {
                    const damagedStructures = creep.room.find(FIND_STRUCTURES, {
                        filter: (s) =>
                            s.hits < s.hitsMax &&
                            s.structureType !== STRUCTURE_WALL &&
                            s.structureType !== STRUCTURE_RAMPART,
                    });
                    if (damagedStructures.length > 0) {
                        repairTarget =
                            creep.pos.findClosestByPath(damagedStructures);
                    }
                }

                if (
                    repairTarget &&
                    creep.repair(repairTarget) === ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(repairTarget, {
                        visualizePathStyle: { stroke: "#ffffff" },
                        reusePath: 20,
                    });
                }
            }
            return;
        }

        // When collecting energy, prioritize tombstones, dropped energy, containers, then sources
        if (creep.store.getFreeCapacity() > 0) {
            // Check if miners are already spawned in this room
            const existingMiners = Object.values(Game.creeps).filter(
                (c) =>
                    c.memory.role === "miner" &&
                    c.memory.targetRoom === targetRoom,
            );
            const hasMiners = existingMiners.length > 0;

            // First check for tombstones (in case another builder/creep dies)
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

            // Check for dropped energy (from container overflow)
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

            // Check for nearby containers first (within range 10)
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

            // If miners are spawned, just wait at containers instead of harvesting sources
            if (hasMiners) {
                // Wait for containers to fill up
                const allContainers = creep.room.find(FIND_STRUCTURES, {
                    filter: (s) =>
                        s.structureType === STRUCTURE_CONTAINER &&
                        s.store[RESOURCE_ENERGY] > 0,
                });
                if (allContainers.length > 0) {
                    const target = creep.pos.findClosestByPath(allContainers);
                    if (target && creep.pos.getRangeTo(target) > 1) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffaa00" },
                            reusePath: 20,
                        });
                    }
                }
                return;
            }

            // If no miners, harvest from sources
            // If no nearby containers, check for nearby source (within range 10)
            const nearbySource = creep.pos.findInRange(
                FIND_SOURCES_ACTIVE,
                10,
            )[0];
            if (nearbySource) {
                if (creep.harvest(nearbySource) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(nearbySource, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                        reusePath: 20,
                    });
                }
                return;
            }

            // Fallback: find closest between remaining containers and sources
            const allContainers = creep.room.find(FIND_STRUCTURES, {
                filter: (s) =>
                    s.structureType === STRUCTURE_CONTAINER &&
                    s.store[RESOURCE_ENERGY] > 0,
            });
            const allSources = creep.room.find(FIND_SOURCES_ACTIVE);

            const closestContainer = creep.pos.findClosestByPath(allContainers);
            const closestSource = creep.pos.findClosestByPath(allSources);

            let target = null;
            if (closestContainer && closestSource) {
                // Pick whichever is closer
                target =
                    creep.pos.getRangeTo(closestContainer) <=
                    creep.pos.getRangeTo(closestSource)
                        ? closestContainer
                        : closestSource;
            } else if (closestContainer) {
                target = closestContainer;
            } else if (closestSource) {
                target = closestSource;
            }

            if (target) {
                if (target.energy !== undefined) {
                    // It's a source
                    if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffaa00" },
                            reusePath: 20,
                        });
                    }
                } else {
                    // It's a container
                    if (
                        creep.withdraw(target, RESOURCE_ENERGY) ===
                        ERR_NOT_IN_RANGE
                    ) {
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

module.exports = roleRemoteBuilder;

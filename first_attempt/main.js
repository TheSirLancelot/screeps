var roleUpgrader = require("role.upgrader");
var roleBuilder = require("role.builder");
var roleRepairer = require("role.repairer");
var roleHauler = require("role.hauler");
var roleMiner = require("role.miner");
var roleReserver = require("role.reserver");
var roleRemoteBuilder = require("role.remote_builder");
var roleRemoteRepairer = require("role.remote_repairer");
var roleRemoteHauler = require("role.remote_hauler");
var spawner = require("spawner");
var roleManager = require("role.manager");
var creepUtils = require("creep.utils");
var towerManager = require("tower.manager");
var creepCalculator = require("creep.calculator");
var config = require("config");

var roleHandlers = {
    miner: roleMiner,
    upgrader: roleUpgrader,
    builder: roleBuilder,
    repairer: roleRepairer,
    hauler: roleHauler,
    reserver: roleReserver,
    remote_builder: roleRemoteBuilder,
    remote_repairer: roleRemoteRepairer,
    remote_hauler: roleRemoteHauler,
};

module.exports.loop = function () {
    for (var name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log("Clearing non-existing creep memory:", name);
        }
    }

    // Cache owned rooms and spawns every 100 ticks to save CPU
    if (Game.time % 100 === 0) {
        const ownedRooms = Object.values(Game.rooms).filter(
            (room) => room.controller && room.controller.my,
        );
        Memory.empire = Memory.empire || {};
        Memory.empire.roomData = {};

        for (const room of ownedRooms) {
            const spawns = room.find(FIND_MY_SPAWNS);
            Memory.empire.roomData[room.name] = {
                spawns: spawns.map((s) => s.id),
            };
        }
        if (
            Game.time % 100 === 0 &&
            Object.keys(Memory.empire.roomData).length > 0
        ) {
            console.log(
                "Updated empire room cache:",
                Object.keys(Memory.empire.roomData).join(", "),
            );
        }
    }

    // Use cached room/spawn data
    Memory.empire = Memory.empire || {};
    const roomData = Memory.empire.roomData || {};
    const ownedRoomNames = Object.keys(roomData);

    // Assign roles, calculate needs, and spawn per room
    for (const roomName of ownedRoomNames) {
        const room = Game.rooms[roomName];
        if (!room) continue; // Room no longer visible

        roleManager.manageAllCreeps(room);
        const roleStats = roleManager.getRoleStats(room);

        const recommendedMinCreeps = creepCalculator.calculateMinCreeps(room);
        const creepCount = room.find(FIND_MY_CREEPS).length;

        // Get spawn from cache; fall back to find if cache is stale
        let activeSpawn = null;
        const cachedSpawnIds = roomData[roomName].spawns || [];
        for (const spawnId of cachedSpawnIds) {
            const spawn = Game.getObjectById(spawnId);
            if (spawn && !spawn.spawning) {
                activeSpawn = spawn;
                break;
            }
        }
        if (!activeSpawn && cachedSpawnIds.length > 0) {
            activeSpawn = Game.getObjectById(cachedSpawnIds[0]);
        }

        // Log status only when at or below critical creep threshold
        if (creepCount <= config.CRITICAL_CREEPS && Game.time % 10 === 0) {
            const energyAvailable = room.energyAvailable;
            const energyCapacity = room.energyCapacityAvailable;
            const spawningStatus =
                activeSpawn && activeSpawn.spawning
                    ? "spawning"
                    : !activeSpawn
                      ? "no spawn"
                      : `waiting (${energyAvailable}/${energyCapacity}E)`;
            console.log(
                `[Tick ${Game.time}] Room ${room.name} | Creeps: ${creepCount}/${recommendedMinCreeps} (M=${roleStats.miner} Ha=${roleStats.hauler} B=${roleStats.builder} U=${roleStats.upgrader} R=${roleStats.repairer}) | Spawner: ${spawningStatus}`,
            );
        }

        spawner.run(creepCount, recommendedMinCreeps, room, activeSpawn);

        if (activeSpawn && activeSpawn.spawning) {
            const spawningCreep = Game.creeps[activeSpawn.spawning.name];
            activeSpawn.room.visual.text(
                "🛠️" + spawningCreep.memory.role,
                activeSpawn.pos.x + 1,
                activeSpawn.pos.y,
                { align: "left", opacity: 0.8 },
            );
        }
    }

    // Check remote room reservations and spawn reservers if needed
    Memory.remoteRooms = Memory.remoteRooms || [];
    for (const remoteRoomName of Memory.remoteRooms) {
        // Only calculate path if not already calculated
        Memory.remotePaths = Memory.remotePaths || {};
        if (!Memory.remotePaths[remoteRoomName]) {
            Memory.remotePaths[remoteRoomName] = {
                calculatedAt: Game.time,
                travelTime: null, // Will be filled by first reserver
            };
        }

        // Check if reserver already exists for this room
        const existingReserver = Object.values(Game.creeps).find(
            (c) =>
                c.memory.role === "reserver" &&
                c.memory.targetRoom === remoteRoomName,
        );

        // Check if room has vision
        const remoteRoom = Game.rooms[remoteRoomName];
        if (remoteRoom && remoteRoom.controller) {
            const controller = remoteRoom.controller;
            const reservation = controller.reservation;
            const existingRemoteBuilders = Object.values(Game.creeps).filter(
                (c) =>
                    c.memory.role === "remote_builder" &&
                    c.memory.targetRoom === remoteRoomName,
            );
            const remoteSites = remoteRoom.find(FIND_CONSTRUCTION_SITES);
            const remoteSources = remoteRoom.find(FIND_SOURCES);

            // Determine if we need a reserver
            let needsReserver = false;
            if (!reservation || reservation.username !== "TheSirLancelot") {
                needsReserver = true;
            } else {
                // Check if reservation is low
                const travelTime =
                    Memory.remotePaths[remoteRoomName].travelTime || 100;
                const bufferTime = 500;
                const spawnThreshold = travelTime * 2 + bufferTime;

                if (reservation.ticksToEnd < spawnThreshold) {
                    needsReserver = true;
                }
            }

            if (needsReserver && !existingReserver && Game.time % 10 === 0) {
                console.log(
                    `Remote room ${remoteRoomName} needs reserver (reservation: ${reservation ? reservation.ticksToEnd : 0})`,
                );

                const spawn = Object.values(Game.spawns).find(
                    (s) => !s.spawning,
                );
                const reserverBody = [CLAIM, CLAIM, MOVE, MOVE];
                const reserverCost = 1300;

                if (spawn && spawn.room.energyAvailable >= reserverCost) {
                    const name = `Reserver_${remoteRoomName}_${Game.time}`;
                    const result = spawn.spawnCreep(reserverBody, name, {
                        memory: {
                            role: "reserver",
                            targetRoom: remoteRoomName,
                            fixedRole: true,
                        },
                    });
                    if (result === OK) {
                        console.log(
                            `Spawning reserver ${name} for ${remoteRoomName}`,
                        );
                    }
                }
            }

            if (remoteSites.length > 0) {
                const spawn = Object.values(Game.spawns).find(
                    (s) => !s.spawning,
                );
                const builderBody = [
                    WORK,
                    WORK,
                    WORK,
                    WORK,
                    CARRY,
                    CARRY,
                    CARRY,
                    CARRY,
                    MOVE,
                    MOVE,
                    MOVE,
                    MOVE,
                    MOVE,
                    MOVE,
                    MOVE,
                    MOVE,
                ];
                const builderCost = 1200;

                if (
                    spawn &&
                    spawn.room.energyAvailable >= builderCost &&
                    existingRemoteBuilders.length < remoteSources.length
                ) {
                    const assignedSourceIds = existingRemoteBuilders
                        .map((c) => c.memory.assignedSourceId)
                        .filter(Boolean);
                    const availableSource = remoteSources.find(
                        (source) => !assignedSourceIds.includes(source.id),
                    );
                    const name = `RemoteBuilder_${remoteRoomName}_${Game.time}`;
                    const result = spawn.spawnCreep(builderBody, name, {
                        memory: {
                            role: "remote_builder",
                            targetRoom: remoteRoomName,
                            fixedRole: true,
                            assignedSourceId: availableSource
                                ? availableSource.id
                                : null,
                        },
                    });
                    if (result === OK) {
                        console.log(
                            `Spawning remote builder ${name} for ${remoteRoomName}`,
                        );
                    }
                }
            }

            // Check for containers and spawn remote miners
            const existingRemoteMiners = Object.values(Game.creeps).filter(
                (c) =>
                    c.memory.role === "miner" &&
                    c.memory.targetRoom === remoteRoomName,
            );

            for (const source of remoteSources) {
                const nearbyContainers = source.pos.findInRange(
                    FIND_STRUCTURES,
                    1,
                    {
                        filter: (s) => s.structureType === STRUCTURE_CONTAINER,
                    },
                );

                if (nearbyContainers.length > 0) {
                    const assignedMiner = existingRemoteMiners.find(
                        (c) => c.memory.assignedSourceId === source.id,
                    );

                    if (!assignedMiner) {
                        const spawn = Object.values(Game.spawns).find(
                            (s) => !s.spawning,
                        );
                        const minerBody = [
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            CARRY,
                            MOVE,
                        ];
                        const minerCost = 350;

                        if (spawn && spawn.room.energyAvailable >= minerCost) {
                            const name = `RemoteMiner_${remoteRoomName}_${Game.time}`;
                            const result = spawn.spawnCreep(minerBody, name, {
                                memory: {
                                    role: "miner",
                                    targetRoom: remoteRoomName,
                                    assignedSourceId: source.id,
                                    fixedRole: true,
                                },
                            });
                            if (result === OK) {
                                if (Game.time % 50 === 0) {
                                    console.log(
                                        `Spawning remote miner ${name} for ${remoteRoomName} source ${source.id}`,
                                    );
                                }
                            }
                        }
                    }
                }
            }

            // Check if roads are mostly built and spawn remote haulers
            // Only spawn haulers after roads are done so they don't compete with builders for energy
            const roadSites = remoteRoom
                .find(FIND_CONSTRUCTION_SITES)
                .filter((s) => s.structureType === STRUCTURE_ROAD);

            if (roadSites.length === 0) {
                // All roads built, check if we need haulers
                const existingRemoteHaulers = Object.values(Game.creeps).filter(
                    (c) =>
                        c.memory.role === "remote_hauler" &&
                        c.memory.targetRoom === remoteRoomName &&
                        c.memory.fixedRole === true,
                );

                // Spawn one hauler per source with containers
                for (const source of remoteSources) {
                    // Find miner assigned to this source
                    const assignedMiner = existingRemoteMiners.find(
                        (c) => c.memory.assignedSourceId === source.id,
                    );

                    if (assignedMiner) {
                        const assignedHauler = existingRemoteHaulers.find(
                            (c) =>
                                c.memory.assignedMinerId === assignedMiner.id,
                        );

                        if (!assignedHauler) {
                            const spawn = Object.values(Game.spawns).find(
                                (s) => !s.spawning,
                            );
                            const haulerBody = [
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                CARRY,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                            ];
                            const haulerCost = 1000;

                            if (
                                spawn &&
                                spawn.room.energyAvailable >= haulerCost
                            ) {
                                const name = `RemoteHauler_${remoteRoomName}_${Game.time}`;
                                const result = spawn.spawnCreep(
                                    haulerBody,
                                    name,
                                    {
                                        memory: {
                                            role: "remote_hauler",
                                            targetRoom: remoteRoomName,
                                            homeRoom: spawn.room.name,
                                            assignedMinerId: assignedMiner.id,
                                            fixedRole: true,
                                        },
                                    },
                                );
                                if (result === OK) {
                                    if (Game.time % 50 === 0) {
                                        console.log(
                                            `Spawning remote hauler ${name} for ${remoteRoomName} miner ${assignedMiner.name}`,
                                        );
                                    }
                                }
                            }
                        }
                    }
                }

                // Spawn remote repairers after roads are built
                const existingRepairers = Object.values(Game.creeps).filter(
                    (c) =>
                        c.memory.role === "remote_repairer" &&
                        c.memory.targetRoom === remoteRoomName,
                );

                if (existingRepairers.length === 0) {
                    const spawn = Object.values(Game.spawns).find(
                        (s) => !s.spawning,
                    );
                    const repairerBody = [
                        WORK,
                        WORK,
                        WORK,
                        WORK,
                        CARRY,
                        CARRY,
                        CARRY,
                        CARRY,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                        MOVE,
                    ];
                    const repairerCost = 1200;

                    if (spawn && spawn.room.energyAvailable >= repairerCost) {
                        const name = `RemoteRepairer_${remoteRoomName}_${Game.time}`;
                        const result = spawn.spawnCreep(repairerBody, name, {
                            memory: {
                                role: "remote_repairer",
                                targetRoom: remoteRoomName,
                                fixedRole: true,
                            },
                        });
                        if (result === OK) {
                            if (Game.time % 50 === 0) {
                                console.log(
                                    `Spawning remote repairer ${name} for ${remoteRoomName}`,
                                );
                            }
                        }
                    }
                }
            }
        } else if (!existingReserver) {
            // No vision - use a simple timer to keep reservers rolling
            const remotePathData = Memory.remotePaths[remoteRoomName];
            if (!remotePathData.nextReserverTick) {
                remotePathData.nextReserverTick = Game.time;
            }

            if (Game.time >= remotePathData.nextReserverTick) {
                const spawn = Object.values(Game.spawns).find(
                    (s) => !s.spawning,
                );
                const reserverBody = [CLAIM, CLAIM, MOVE, MOVE];
                const reserverCost = 1300;

                if (spawn && spawn.room.energyAvailable >= reserverCost) {
                    const name = `Reserver_${remoteRoomName}_${Game.time}`;
                    const result = spawn.spawnCreep(reserverBody, name, {
                        memory: {
                            role: "reserver",
                            targetRoom: remoteRoomName,
                            fixedRole: true,
                        },
                    });
                    if (result === OK) {
                        console.log(
                            `Spawning reserver ${name} for ${remoteRoomName} (no vision)`,
                        );
                        // Schedule next refresh before reservation expires
                        const travelTime = remotePathData.travelTime || 100;
                        const bufferTime = 500;
                        const refreshInterval = Math.max(
                            500,
                            5000 - (travelTime * 2 + bufferTime),
                        );
                        remotePathData.nextReserverTick =
                            Game.time + refreshInterval;
                    }
                }
            }

            if (Game.time % 10 === 0) {
                console.log(
                    `Remote room ${remoteRoomName} has no vision - using timer-based reserver spawns`,
                );
            }
        }
    }

    // Run tower logic for all rooms
    towerManager.runAll();

    // Pre-fetch terrain for efficiency (per room)
    const terrainByRoom = {};
    for (const roomName of ownedRoomNames) {
        const room = Game.rooms[roomName];
        if (room) {
            terrainByRoom[room.name] = Game.map.getRoomTerrain(room.name);
        }
    }

    for (var name in Game.creeps) {
        var creep = Game.creeps[name];
        const terrain =
            terrainByRoom[creep.room.name] ||
            Game.map.getRoomTerrain(creep.room.name);

        // Perform common maintenance tasks
        creepUtils.maintain(creep, terrain);

        var roleHandler = roleHandlers[creep.memory.role];
        if (roleHandler && roleHandler.run) {
            roleHandler.run(creep);
        }
    }
};

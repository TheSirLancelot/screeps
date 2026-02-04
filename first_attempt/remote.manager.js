/**
 * Remote Room Manager
 * Handles all remote room operations including reservers, builders, miners, haulers, and repairers
 */

var config = require("config");

var remoteManager = {
    /**
     * Check if the main room has adequate creeps before spawning remote creeps
     * @returns {boolean} True if main room is ready for remote operations
     */
    isMainRoomReady: function () {
        // Get all owned rooms
        const ownedRooms = Object.values(Game.rooms).filter(
            (r) => r.controller && r.controller.my,
        );

        // Check each owned room for adequate staffing
        for (const room of ownedRooms) {
            // Count main room creeps (exclude remote creeps)
            const mainRoomCreeps = Object.values(Game.creeps).filter(
                (c) =>
                    c.room.name === room.name &&
                    !c.memory.targetRoom &&
                    !c.spawning,
            );

            const creepCount = mainRoomCreeps.length;
            const sources = room.find(FIND_SOURCES);
            const sourceCount = sources.length;

            // Count dedicated miners and haulers
            const dedicatedMiners = mainRoomCreeps.filter(
                (c) => c.memory.role === "miner" && c.memory.fixedRole === true,
            ).length;
            const dedicatedHaulers = mainRoomCreeps.filter(
                (c) =>
                    c.memory.role === "hauler" && c.memory.fixedRole === true,
            ).length;

            // Calculate recommended minimum for this room
            const recommendedMinCreeps = config.MIN_CREEPS;
            const minHaulers = config.MIN_HAULERS || 2;

            // If any main room is understaffed OR missing critical roles, don't spawn remote creeps
            if (creepCount < recommendedMinCreeps) {
                return false;
            }

            // Ensure we have miners for each source and minimum haulers
            if (
                dedicatedMiners < sourceCount ||
                dedicatedHaulers < minHaulers
            ) {
                return false;
            }
        }

        return true;
    },

    /**
     * Manage all remote rooms defined in Memory.remoteRooms
     */
    manageRemoteRooms: function () {
        // Only spawn remote creeps if main rooms are adequately staffed
        if (!this.isMainRoomReady()) {
            return;
        }

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
                this.manageRemoteRoomWithVision(
                    remoteRoomName,
                    remoteRoom,
                    existingReserver,
                );
            } else if (!existingReserver) {
                this.manageRemoteRoomWithoutVision(remoteRoomName);
            }
        }
    },

    /**
     * Manage remote room when we have vision
     */
    manageRemoteRoomWithVision: function (
        remoteRoomName,
        remoteRoom,
        existingReserver,
    ) {
        const controller = remoteRoom.controller;
        const reservation = controller.reservation;
        const existingRemoteBuilders = Object.values(Game.creeps).filter(
            (c) =>
                c.memory.role === "remote_builder" &&
                c.memory.targetRoom === remoteRoomName,
        );
        const remoteSites = remoteRoom.find(FIND_CONSTRUCTION_SITES);
        const remoteSources = remoteRoom.find(FIND_SOURCES);

        // Spawn reserver FIRST (before attackers) - critical for source regeneration
        this.spawnReserverIfNeeded(
            remoteRoomName,
            reservation,
            existingReserver,
        );

        // Spawn attackers if hostiles are present (but don't block other spawning)
        this.spawnRemoteAttackersIfNeeded(remoteRoomName, remoteRoom);

        // Spawn remote builders - always spawn at least one for new rooms to create construction sites
        if (remoteSites.length > 0 || existingRemoteBuilders.length === 0) {
            this.spawnRemoteBuildersIfNeeded(
                remoteRoomName,
                remoteSources,
                existingRemoteBuilders,
            );
        }

        // Spawn remote miners for sources with containers
        const existingRemoteMiners = Object.values(Game.creeps).filter(
            (c) =>
                c.memory.role === "miner" &&
                c.memory.targetRoom === remoteRoomName,
        );
        this.spawnRemoteMinersIfNeeded(
            remoteRoomName,
            remoteSources,
            existingRemoteMiners,
        );

        // Check if roads are mostly built and spawn remote haulers
        const roadSites = remoteRoom
            .find(FIND_CONSTRUCTION_SITES)
            .filter((s) => s.structureType === STRUCTURE_ROAD);

        if (roadSites.length === 0) {
            this.spawnRemoteHaulersIfNeeded(
                remoteRoomName,
                remoteSources,
                existingRemoteMiners,
            );
            this.spawnRemoteRepairersIfNeeded(remoteRoomName);
        }
    },

    /**
     * Manage remote room without vision using timer-based spawning
     */
    manageRemoteRoomWithoutVision: function (remoteRoomName) {
        const remotePathData = Memory.remotePaths[remoteRoomName];
        if (!remotePathData.nextReserverTick) {
            remotePathData.nextReserverTick = Game.time;
        }

        if (Game.time >= remotePathData.nextReserverTick) {
            const spawn = Object.values(Game.spawns).find((s) => !s.spawning);
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
    },

    /**
     * Spawn attacker if hostile creeps are present in the remote room
     */
    spawnRemoteAttackersIfNeeded: function (remoteRoomName, remoteRoom) {
        const hostiles = remoteRoom.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length === 0) {
            return;
        }

        const existingAttackers = Object.values(Game.creeps).filter(
            (c) =>
                c.memory.role === "attacker" &&
                c.memory.targetRoom === remoteRoomName,
        );

        if (existingAttackers.length > 0) {
            return;
        }

        const spawn = Object.values(Game.spawns).find((s) => !s.spawning);
        const attackerBody = [
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            RANGED_ATTACK,
            RANGED_ATTACK,
            TOUGH,
            TOUGH,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
        ];
        const attackerCost = 1020;

        if (spawn && spawn.room.energyAvailable >= attackerCost) {
            const name = `RemoteAttacker_${remoteRoomName}_${Game.time}`;
            const result = spawn.spawnCreep(attackerBody, name, {
                memory: {
                    role: "attacker",
                    targetRoom: remoteRoomName,
                    fixedRole: true,
                },
            });
            if (result === OK) {
                console.log(
                    `Spawning remote attacker ${name} for ${remoteRoomName}`,
                );
            }
        }
    },

    /**
     * Spawn reserver if reservation is low or missing
     */
    spawnReserverIfNeeded: function (
        remoteRoomName,
        reservation,
        existingReserver,
    ) {
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

            const spawn = Object.values(Game.spawns).find((s) => !s.spawning);
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
    },

    /**
     * Spawn remote builders if needed
     */
    spawnRemoteBuildersIfNeeded: function (
        remoteRoomName,
        remoteSources,
        existingRemoteBuilders,
    ) {
        const spawn = Object.values(Game.spawns).find((s) => !s.spawning);
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
    },

    /**
     * Spawn remote miners for sources with containers
     */
    spawnRemoteMinersIfNeeded: function (
        remoteRoomName,
        remoteSources,
        existingRemoteMiners,
    ) {
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
    },

    /**
     * Spawn remote haulers (one per miner)
     */
    spawnRemoteHaulersIfNeeded: function (
        remoteRoomName,
        remoteSources,
        existingRemoteMiners,
    ) {
        const existingRemoteHaulers = Object.values(Game.creeps).filter(
            (c) =>
                c.memory.role === "remote_hauler" &&
                c.memory.targetRoom === remoteRoomName &&
                c.memory.fixedRole === true,
        );

        for (const source of remoteSources) {
            const assignedMiner = existingRemoteMiners.find(
                (c) => c.memory.assignedSourceId === source.id,
            );

            if (assignedMiner) {
                const assignedHauler = existingRemoteHaulers.find(
                    (c) => c.memory.assignedMinerId === assignedMiner.id,
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
                        MOVE,
                        MOVE,
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

                    if (spawn && spawn.room.energyAvailable >= haulerCost) {
                        const name = `RemoteHauler_${remoteRoomName}_${Game.time}`;
                        const result = spawn.spawnCreep(haulerBody, name, {
                            memory: {
                                role: "remote_hauler",
                                targetRoom: remoteRoomName,
                                homeRoom: spawn.room.name,
                                assignedMinerId: assignedMiner.id,
                                fixedRole: true,
                            },
                        });
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
    },

    /**
     * Spawn remote repairers (one per remote room)
     */
    spawnRemoteRepairersIfNeeded: function (remoteRoomName) {
        const existingRepairers = Object.values(Game.creeps).filter(
            (c) =>
                c.memory.role === "remote_repairer" &&
                c.memory.targetRoom === remoteRoomName,
        );

        if (existingRepairers.length === 0) {
            const spawn = Object.values(Game.spawns).find((s) => !s.spawning);
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
    },
};

module.exports = remoteManager;

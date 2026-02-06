/**
 * Remote Room Manager
 * Handles all remote room operations including reservers, builders, miners, haulers, and repairers
 */

var config = require("config");

// Remote creep body definitions
const roomCounts = Memory.remoteRooms.map((roomName) => {
    const creepsForRoom = Object.values(Game.creeps).filter(
        (c) => c.memory.targetRoom === roomName,
    );
    return {
        name: roomName,
        creepCount: creepsForRoom.length,
    };
});
roomCounts.sort((a, b) => a.creepCount - b.creepCount);

const REMOTE_BODIES = {
    reserver: {
        body: [CLAIM, CLAIM, MOVE, MOVE],
        cost: 1300,
    },
    attacker: {
        body: [
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
        ],
        cost: 1020,
    },
    builder: {
        body: [
            WORK,
            WORK,
            WORK,
            CARRY,
            CARRY,
            CARRY,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
        ],
        cost: 750,
    },
    miner: {
        body: [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE],
        cost: 350,
    },
    hauler: {
        body: [
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
        ],
        cost: 800,
    },
    repairer: {
        body: [
            WORK,
            WORK,
            WORK,
            CARRY,
            CARRY,
            CARRY,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
        ],
        cost: 750,
    },
};

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

            // Calculate recommended minimum for this room (based on RCL)
            const roomLevel = mainRoom.controller
                ? mainRoom.controller.level
                : 0;
            const recommendedMinCreeps = config.getMinCreeps(roomLevel);
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
     * Build a spawn queue for remote creeps based on needs in each room
     * Priority: Reserver > Builder > Miner > Hauler > Repairer > Attacker
     */
    buildRemoteSpawnQueue: function () {
        const queue = [];
        Memory.remoteRooms = Memory.remoteRooms || [];

        const roomCounts = Memory.remoteRooms.map((roomName) => {
            const creepsForRoom = Object.values(Game.creeps).filter(
                (c) => c.memory.targetRoom === roomName,
            );
            return {
                name: roomName,
                creepCount: creepsForRoom.length,
            };
        });
        roomCounts.sort((a, b) => a.creepCount - b.creepCount);

        const reservationThreshold = config.REMOTE_RESERVE_THRESHOLD || 500;

        for (const { name: roomName } of roomCounts) {
            const remoteRoom = Game.rooms[roomName];
            const existingReserver = Object.values(Game.creeps).find(
                (c) =>
                    c.memory.role === "reserver" &&
                    c.memory.targetRoom === roomName,
            );
            const reservationTicks =
                remoteRoom && remoteRoom.controller
                    ? remoteRoom.controller.reservation
                        ? remoteRoom.controller.reservation.ticksToEnd
                        : 0
                    : 0;
            const remotePathData =
                Memory.remotePaths && Memory.remotePaths[roomName]
                    ? Memory.remotePaths[roomName]
                    : null;
            const canSpawnReserver =
                remoteRoom && remoteRoom.controller
                    ? reservationTicks <= reservationThreshold
                    : remotePathData && remotePathData.nextReserverTick
                      ? Game.time >= remotePathData.nextReserverTick
                      : true;
            const existingBuilders = Object.values(Game.creeps).filter(
                (c) =>
                    c.memory.role === "remote_builder" &&
                    c.memory.targetRoom === roomName,
            );
            const existingMiners = Object.values(Game.creeps).filter(
                (c) =>
                    c.memory.role === "miner" &&
                    c.memory.targetRoom === roomName,
            );
            const existingHaulers = Object.values(Game.creeps).filter(
                (c) =>
                    c.memory.role === "remote_hauler" &&
                    c.memory.targetRoom === roomName,
            );
            const existingRepairers = Object.values(Game.creeps).filter(
                (c) =>
                    c.memory.role === "remote_repairer" &&
                    c.memory.targetRoom === roomName,
            );
            const existingAttackers = Object.values(Game.creeps).filter(
                (c) =>
                    c.memory.role === "attacker" &&
                    c.memory.targetRoom === roomName,
            );

            // Priority 1: Reserver (only when reservation is low or timer allows)
            if (canSpawnReserver) {
                const queuedReserver = queue.find(
                    (q) => q.type === "reserver" && q.targetRoom === roomName,
                );
                if (!existingReserver && !queuedReserver) {
                    queue.push({
                        priority: 1,
                        type: "reserver",
                        targetRoom: roomName,
                        validate: () => {
                            const current = Object.values(Game.creeps).find(
                                (c) =>
                                    c.memory.role === "reserver" &&
                                    c.memory.targetRoom === roomName,
                            );
                            return !current;
                        },
                    });
                }
            }

            // Only proceed if room has vision
            if (remoteRoom && remoteRoom.controller) {
                const firstSpawn = Object.values(Game.spawns)[0];
                const myUsername =
                    firstSpawn && firstSpawn.owner
                        ? firstSpawn.owner.username
                        : null;
                const hasMyReservation =
                    remoteRoom.controller.reservation &&
                    myUsername &&
                    remoteRoom.controller.reservation.username === myUsername;
                const sources = remoteRoom.find(FIND_SOURCES);
                const constructionSites = remoteRoom.find(
                    FIND_CONSTRUCTION_SITES,
                );
                const roadSites = constructionSites.filter(
                    (s) => s.structureType === STRUCTURE_ROAD,
                );

                if (hasMyReservation) {
                    const containersBuilt = sources.filter((source) => {
                        const containers = source.pos.findInRange(
                            FIND_STRUCTURES,
                            1,
                            {
                                filter: (s) =>
                                    s.structureType === STRUCTURE_CONTAINER,
                            },
                        );
                        return containers.length > 0;
                    }).length;

                    // Priority 2/3: Remote builders (build containers and roads)
                    if (
                        constructionSites.length > 0 ||
                        existingBuilders.length === 0
                    ) {
                        // Spawn 1 builder per source for faster construction
                        const neededBuilders = sources.length;
                        const queuedBuilders = queue.filter(
                            (q) =>
                                q.type === "remote_builder" &&
                                q.targetRoom === roomName,
                        ).length;
                        for (
                            let i = existingBuilders.length + queuedBuilders;
                            i < neededBuilders;
                            i++
                        ) {
                            const builderPriority = containersBuilt > 0 ? 3 : 2;
                            queue.push({
                                priority: builderPriority,
                                type: "remote_builder",
                                targetRoom: roomName,
                                validate: () => {
                                    const builders = Object.values(
                                        Game.creeps,
                                    ).filter(
                                        (c) =>
                                            c.memory.role ===
                                                "remote_builder" &&
                                            c.memory.targetRoom === roomName,
                                    );
                                    return builders.length < neededBuilders;
                                },
                            });
                        }
                    }

                    // Priority 2: Remote repairers (keep structures healthy once containers are built)
                    if (containersBuilt > 0) {
                        const neededRepairers = 1;
                        const queuedRepairers = queue.filter(
                            (q) =>
                                q.type === "remote_repairer" &&
                                q.targetRoom === roomName,
                        ).length;
                        for (
                            let i = existingRepairers.length + queuedRepairers;
                            i < neededRepairers;
                            i++
                        ) {
                            queue.push({
                                priority: 2,
                                type: "remote_repairer",
                                targetRoom: roomName,
                                validate: () => {
                                    const current = Object.values(
                                        Game.creeps,
                                    ).filter(
                                        (c) =>
                                            c.memory.role ===
                                                "remote_repairer" &&
                                            c.memory.targetRoom === roomName,
                                    ).length;
                                    return current < neededRepairers;
                                },
                            });
                        }
                    }

                    // Priority 4: Remote miners (one per source with container)
                    for (const source of sources) {
                        // Check if source has a container (built or under construction)
                        const containers = source.pos.findInRange(
                            FIND_STRUCTURES,
                            1,
                            {
                                filter: (s) =>
                                    s.structureType === STRUCTURE_CONTAINER,
                            },
                        );
                        const containerSites = source.pos.findInRange(
                            FIND_CONSTRUCTION_SITES,
                            1,
                            {
                                filter: (s) =>
                                    s.structureType === STRUCTURE_CONTAINER,
                            },
                        );

                        // Only spawn miner if container exists or is being built
                        if (
                            containers.length > 0 ||
                            containerSites.length > 0
                        ) {
                            const minersForSource = Object.values(
                                Game.creeps,
                            ).filter(
                                (c) =>
                                    c.memory.role === "miner" &&
                                    c.memory.targetRoom === roomName &&
                                    c.memory.assignedSourceId === source.id,
                            ).length;

                            if (minersForSource === 0) {
                                queue.push({
                                    priority: 4,
                                    type: "remote_miner",
                                    targetRoom: roomName,
                                    sourceId: source.id,
                                    validate: () => {
                                        const current = Object.values(
                                            Game.creeps,
                                        ).filter(
                                            (c) =>
                                                c.memory.role === "miner" &&
                                                c.memory.targetRoom ===
                                                    roomName &&
                                                c.memory.assignedSourceId ===
                                                    source.id,
                                        ).length;
                                        return current === 0;
                                    },
                                });
                            }
                        }
                    }

                    // Priority 5: Remote haulers (spawn when containers are built)
                    if (containersBuilt > 0) {
                        const neededHaulers = Math.max(1, containersBuilt);
                        const queuedHaulers = queue.filter(
                            (q) =>
                                q.type === "remote_hauler" &&
                                q.targetRoom === roomName,
                        ).length;
                        for (
                            let i = existingHaulers.length + queuedHaulers;
                            i < neededHaulers;
                            i++
                        ) {
                            queue.push({
                                priority: 5,
                                type: "remote_hauler",
                                targetRoom: roomName,
                                validate: () => {
                                    const haulers = Object.values(
                                        Game.creeps,
                                    ).filter(
                                        (c) =>
                                            c.memory.role === "remote_hauler" &&
                                            c.memory.targetRoom === roomName,
                                    );
                                    return haulers.length < neededHaulers;
                                },
                            });
                        }
                    }
                }

                // Priority 6: Attackers (only if hostiles present)
                const hostiles = remoteRoom.find(FIND_HOSTILE_CREEPS);
                if (hostiles.length > 0 && existingAttackers.length === 0) {
                    queue.push({
                        priority: 6,
                        type: "attacker",
                        targetRoom: roomName,
                        validate: () => {
                            const current = Object.values(Game.creeps).find(
                                (c) =>
                                    c.memory.role === "attacker" &&
                                    c.memory.targetRoom === roomName,
                            );
                            return !current;
                        },
                    });
                }
            }
        }

        return queue;
    },

    /**
     * Spawn next remote creep from queue
     */
    spawnFromRemoteQueue: function (queue) {
        const spawn = Object.values(Game.spawns).find((s) => !s.spawning);
        if (!spawn) {
            return;
        }

        const mainRoom = spawn.room;
        const energyAvailable = mainRoom.energyAvailable;

        const roomCreepCounts = {};
        for (const creep of Object.values(Game.creeps)) {
            if (creep.memory.targetRoom) {
                roomCreepCounts[creep.memory.targetRoom] =
                    (roomCreepCounts[creep.memory.targetRoom] || 0) + 1;
            }
        }

        const sortedQueue = queue.slice().sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            const aCount = roomCreepCounts[a.targetRoom] || 0;
            const bCount = roomCreepCounts[b.targetRoom] || 0;
            return aCount - bCount;
        });

        for (const item of sortedQueue) {
            // Validate entry (might be stale)
            if (!item.validate()) {
                continue;
            }

            // Determine body and cost based on type
            let body, cost, memoryObj;

            switch (item.type) {
                case "reserver":
                    body = REMOTE_BODIES.reserver.body;
                    cost = REMOTE_BODIES.reserver.cost;
                    memoryObj = {
                        role: "reserver",
                        targetRoom: item.targetRoom,
                        fixedRole: true,
                    };
                    break;
                case "remote_builder":
                    body = REMOTE_BODIES.builder.body;
                    cost = REMOTE_BODIES.builder.cost;
                    memoryObj = {
                        role: "remote_builder",
                        targetRoom: item.targetRoom,
                        fixedRole: true,
                    };
                    break;
                case "remote_miner":
                    body = REMOTE_BODIES.miner.body;
                    cost = REMOTE_BODIES.miner.cost;
                    memoryObj = {
                        role: "miner",
                        targetRoom: item.targetRoom,
                        assignedSourceId: item.sourceId,
                        fixedRole: true,
                    };
                    break;
                case "remote_hauler":
                    body = REMOTE_BODIES.hauler.body;
                    cost = REMOTE_BODIES.hauler.cost;
                    memoryObj = {
                        role: "remote_hauler",
                        targetRoom: item.targetRoom,
                        homeRoom: mainRoom.name,
                        fixedRole: true,
                    };
                    break;
                case "remote_repairer":
                    body = REMOTE_BODIES.repairer.body;
                    cost = REMOTE_BODIES.repairer.cost;
                    memoryObj = {
                        role: "remote_repairer",
                        targetRoom: item.targetRoom,
                        fixedRole: true,
                    };
                    break;
                case "attacker":
                    body = REMOTE_BODIES.attacker.body;
                    cost = REMOTE_BODIES.attacker.cost;
                    memoryObj = {
                        role: "attacker",
                        targetRoom: item.targetRoom,
                        fixedRole: true,
                    };
                    break;
                default:
                    continue;
            }

            // Check if we have enough energy
            if (energyAvailable < cost) {
                return; // Can't spawn, stop trying (queue is prioritized)
            }

            // Spawn it!
            const name = `${item.type}_${item.targetRoom}_${Game.time}`;
            const result = spawn.spawnCreep(body, name, { memory: memoryObj });

            if (result === OK) {
                console.log(
                    `Spawning ${item.type} ${name} for ${item.targetRoom} (cost: ${cost}E)`,
                );
                return; // Spawn one per tick
            }
        }
    },

    manageRemoteRooms: function () {
        // Only spawn remote creeps if main rooms are adequately staffed
        if (!this.isMainRoomReady()) {
            return;
        }

        Memory.remoteRooms = Memory.remoteRooms || [];

        // Initialize remote paths for tracking
        Memory.remotePaths = Memory.remotePaths || {};
        for (const roomName of Memory.remoteRooms) {
            if (!Memory.remotePaths[roomName]) {
                Memory.remotePaths[roomName] = {
                    calculatedAt: Game.time,
                    travelTime: null,
                };
            }
        }

        // Build and store spawn queue organized by room
        const queue = this.buildRemoteSpawnQueue();
        Memory.remoteSpawnQueue = {};
        for (const roomName of Memory.remoteRooms) {
            Memory.remoteSpawnQueue[roomName] = queue
                .filter((item) => item.targetRoom === roomName)
                .map((item) => ({
                    priority: item.priority,
                    type: item.type,
                    sourceId: item.sourceId || null,
                }));
        }

        // Spawn from queue
        this.spawnFromRemoteQueue(queue);

        // Debug: log distribution every 50 ticks
        if (Game.time % 50 === 0) {
            console.log("Remote room distribution:");
            const firstSpawn = Object.values(Game.spawns)[0];
            const myUsername =
                firstSpawn && firstSpawn.owner
                    ? firstSpawn.owner.username
                    : null;
            for (const roomName of Memory.remoteRooms) {
                const creepsForRoom = Object.values(Game.creeps).filter(
                    (c) => c.memory.targetRoom === roomName,
                );
                const remoteRoom = Game.rooms[roomName];
                const reservation =
                    remoteRoom && remoteRoom.controller
                        ? remoteRoom.controller.reservation
                        : null;
                const reservationTicks = reservation
                    ? reservation.ticksToEnd
                    : remoteRoom
                      ? 0
                      : "no vision";
                const reservationOwner = reservation
                    ? reservation.username
                    : null;
                const reservationTag =
                    reservationOwner && myUsername
                        ? reservationOwner === myUsername
                            ? "me"
                            : reservationOwner
                        : reservationTicks === "no vision"
                          ? "no vision"
                          : "none";
                console.log(
                    `  ${roomName} (Res - ${reservationTicks} (${reservationTag})): ${creepsForRoom.length} creeps [${creepsForRoom.map((c) => c.name).join(", ") || "none"}]`,
                );
            }
        }

        // Handle room-specific logic that queue doesn't cover
        for (const roomName of Memory.remoteRooms) {
            const remoteRoom = Game.rooms[roomName];
            if (remoteRoom && remoteRoom.controller) {
                // Room has vision - handle reserver refresh and manage sources
                const remoteSources = remoteRoom.find(FIND_SOURCES);
                for (const source of remoteSources) {
                    const containers = source.pos.findInRange(
                        FIND_STRUCTURES,
                        1,
                        {
                            filter: (s) =>
                                s.structureType === STRUCTURE_CONTAINER,
                        },
                    );
                    if (containers.length === 0) {
                        // Need to place container at source - find adjacent empty tile
                        const x = source.pos.x;
                        const y = source.pos.y;
                        for (let dx = -1; dx <= 1; dx++) {
                            for (let dy = -1; dy <= 1; dy++) {
                                if (dx === 0 && dy === 0) continue;
                                const checkPos = new RoomPosition(
                                    x + dx,
                                    y + dy,
                                    source.room.name,
                                );
                                const lookResult = remoteRoom.lookAt(checkPos);
                                const hasStructure = lookResult.some(
                                    (o) => o.type === "structure",
                                );
                                if (!hasStructure) {
                                    remoteRoom.createConstructionSite(
                                        checkPos,
                                        STRUCTURE_CONTAINER,
                                    );
                                    break;
                                }
                            }
                        }
                    }
                }

                // Refresh reserver reservation
                const existingReserver = Object.values(Game.creeps).find(
                    (c) =>
                        c.memory.role === "reserver" &&
                        c.memory.targetRoom === roomName,
                );
                if (
                    existingReserver &&
                    remoteRoom.controller.reservation &&
                    remoteRoom.controller.reservation.ticksToExpire < 2000
                ) {
                    // Schedule next reserver spawn
                    const remotePathData = Memory.remotePaths[roomName];
                    const travelTime = remotePathData.travelTime || 100;
                    const bufferTime = 500;
                    const refreshInterval = Math.max(
                        500,
                        5000 - (travelTime * 2 + bufferTime),
                    );
                    remotePathData.nextReserverTick =
                        Game.time + refreshInterval;
                }
            } else {
                // No vision - needs timer management
                const remotePathData = Memory.remotePaths[roomName];
                if (!remotePathData.nextReserverTick) {
                    remotePathData.nextReserverTick = Game.time;
                }

                // Check if reserver exists and reset timer if needed
                const existingReserver = Object.values(Game.creeps).find(
                    (c) =>
                        c.memory.role === "reserver" &&
                        c.memory.targetRoom === roomName,
                );
                if (
                    !existingReserver &&
                    remotePathData.nextReserverTick &&
                    Game.time < remotePathData.nextReserverTick
                ) {
                    remotePathData.nextReserverTick = Game.time;
                }
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
            console.log(
                `${remoteRoomName}: Initialized nextReserverTick to ${Game.time}`,
            );
        }

        // Check if reserver exists before waiting for timer
        const existingReserver = Object.values(Game.creeps).find(
            (c) =>
                c.memory.role === "reserver" &&
                c.memory.targetRoom === remoteRoomName,
        );
        if (
            !existingReserver &&
            remotePathData.nextReserverTick &&
            Game.time < remotePathData.nextReserverTick
        ) {
            console.log(
                `${remoteRoomName}: No reserver found, resetting nextReserverTick from ${remotePathData.nextReserverTick} to ${Game.time}`,
            );
            remotePathData.nextReserverTick = Game.time;
        }

        if (Game.time >= remotePathData.nextReserverTick) {
            const spawn = Object.values(Game.spawns).find((s) => !s.spawning);

            if (!spawn) {
                console.log(`${remoteRoomName}: No available spawn found`);
                return;
            }

            const energyAvailable = spawn.room.energyAvailable;
            const energyNeeded = REMOTE_BODIES.reserver.cost;

            if (energyAvailable < energyNeeded) {
                console.log(
                    `${remoteRoomName}: Not enough energy (${energyAvailable}/${energyNeeded})`,
                );
                return;
            }

            const name = `Reserver_${remoteRoomName}_${Game.time}`;
            const result = spawn.spawnCreep(REMOTE_BODIES.reserver.body, name, {
                memory: {
                    role: "reserver",
                    targetRoom: remoteRoomName,
                    fixedRole: true,
                },
            });

            console.log(`${remoteRoomName}: Spawn attempt result: ${result}`);

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
                remotePathData.nextReserverTick = Game.time + refreshInterval;
            }
        } else {
            if (Game.time % 50 === 0) {
                console.log(
                    `${remoteRoomName}: Waiting for nextReserverTick (${remotePathData.nextReserverTick} vs ${Game.time})`,
                );
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

        if (
            spawn &&
            spawn.room.energyAvailable >= REMOTE_BODIES.attacker.cost
        ) {
            const name = `RemoteAttacker_${remoteRoomName}_${Game.time}`;
            const result = spawn.spawnCreep(REMOTE_BODIES.attacker.body, name, {
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

            if (
                spawn &&
                spawn.room.energyAvailable >= REMOTE_BODIES.reserver.cost
            ) {
                const name = `Reserver_${remoteRoomName}_${Game.time}`;
                const result = spawn.spawnCreep(
                    REMOTE_BODIES.reserver.body,
                    name,
                    {
                        memory: {
                            role: "reserver",
                            targetRoom: remoteRoomName,
                            fixedRole: true,
                        },
                    },
                );
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

        if (
            spawn &&
            spawn.room.energyAvailable >= REMOTE_BODIES.builder.cost &&
            existingRemoteBuilders.length < remoteSources.length
        ) {
            const assignedSourceIds = existingRemoteBuilders
                .map((c) => c.memory.assignedSourceId)
                .filter(Boolean);
            const availableSource = remoteSources.find(
                (source) => !assignedSourceIds.includes(source.id),
            );
            const name = `RemoteBuilder_${remoteRoomName}_${Game.time}`;
            const result = spawn.spawnCreep(REMOTE_BODIES.builder.body, name, {
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

                    if (
                        spawn &&
                        spawn.room.energyAvailable >= REMOTE_BODIES.miner.cost
                    ) {
                        const name = `RemoteMiner_${remoteRoomName}_${Game.time}`;
                        const result = spawn.spawnCreep(
                            REMOTE_BODIES.miner.body,
                            name,
                            {
                                memory: {
                                    role: "miner",
                                    targetRoom: remoteRoomName,
                                    assignedSourceId: source.id,
                                    fixedRole: true,
                                },
                            },
                        );
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

                    if (
                        spawn &&
                        spawn.room.energyAvailable >= REMOTE_BODIES.hauler.cost
                    ) {
                        const name = `RemoteHauler_${remoteRoomName}_${Game.time}`;
                        const result = spawn.spawnCreep(
                            REMOTE_BODIES.hauler.body,
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

            if (
                spawn &&
                spawn.room.energyAvailable >= REMOTE_BODIES.repairer.cost
            ) {
                const name = `RemoteRepairer_${remoteRoomName}_${Game.time}`;
                const result = spawn.spawnCreep(
                    REMOTE_BODIES.repairer.body,
                    name,
                    {
                        memory: {
                            role: "remote_repairer",
                            targetRoom: remoteRoomName,
                            fixedRole: true,
                        },
                    },
                );
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

// Export body definitions for use in spawner.js
remoteManager.REMOTE_BODIES = REMOTE_BODIES;

module.exports = remoteManager;

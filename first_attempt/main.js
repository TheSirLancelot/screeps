var roleUpgrader = require("role.upgrader");
var roleBuilder = require("role.builder");
var roleRepairer = require("role.repairer");
var roleHauler = require("role.hauler");
var roleMiner = require("role.miner");
var roleReserver = require("role.reserver");
var roleRemoteBuilder = require("role.remote_builder");
var roleRemoteRepairer = require("role.remote_repairer");
var roleRemoteHauler = require("role.remote_hauler");
var roleAttacker = require("role.attacker");
var spawner = require("spawner");
var roleManager = require("role.manager");
var remoteManager = require("remote.manager");
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
    attacker: roleAttacker,
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
        const creepCount = room
            .find(FIND_MY_CREEPS)
            .filter((c) => !c.memory.targetRoom).length;

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

    // Manage all remote rooms
    remoteManager.manageRemoteRooms();

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

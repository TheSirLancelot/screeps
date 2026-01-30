var roleHarvester = require("role.harvester");
var roleUpgrader = require("role.upgrader");
var roleBuilder = require("role.builder");
var roleRepairer = require("role.repairer");
var spawner = require("spawner");
const { filter } = require("lodash");

module.exports.loop = function () {
    for (var name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log("Clearing non-existing creep memory:", name);
        }
    }

    var harvesters = _.filter(
        Game.creeps,
        (creep) => creep.memory.role == "harvester",
    );
    var builders = _.filter(
        Game.creeps,
        (creep) => creep.memory.role == "builder",
    );
    var upgraders = _.filter(
        Game.creeps,
        (creep) => creep.memory.role == "upgrader",
    );
    var repairers = _.filter(
        Game.creeps,
        (creep) => creep.memory.role == "repairer",
    );

    console.log("Harvesters: " + harvesters.length);
    console.log("Builders: " + builders.length);
    console.log("Upgraders: " + upgraders.length);
    console.log("Repairers: " + repairers.length);

    spawner.run(
        harvesters.length,
        builders.length,
        upgraders.length,
        repairers.length,
    );

    if (Game.spawns["Spawn1"].spawning) {
        var spawningCreep = Game.creeps[Game.spawns["Spawn1"].spawning.name];
        Game.spawns["Spawn1"].room.visual.text(
            "🛠️" + spawningCreep.memory.role,
            Game.spawns["Spawn1"].pos.x + 1,
            Game.spawns["Spawn1"].pos.y,
            { align: "left", opacity: 0.8 },
        );
    }

    for (var roomName in Game.rooms) {
        var room = Game.rooms[roomName];
        var towers = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType == STRUCTURE_TOWER,
        });
        for (var i = 0; i < towers.length; i += 1) {
            var tower = towers[i];
            var closestDamagedStructure = tower.pos.findClosestByRange(
                FIND_STRUCTURES,
                { filter: (structure) => structure.hits < structure.hitsMax },
            );
            if (closestDamagedStructure) {
                tower.repair(closestDamagedStructure);
            }

            var closestHostile =
                tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            if (closestHostile) {
                tower.attack(closestHostile);
            }
        }
    }

    for (var name in Game.creeps) {
        var creep = Game.creeps[name];
        if (creep.memory.role == "harvester") {
            roleHarvester.run(creep);
        }
        if (creep.memory.role == "upgrader") {
            roleUpgrader.run(creep);
        }
        if (creep.memory.role == "builder") {
            roleBuilder.run(creep);
        }
        if (creep.memory.role == "repairer") {
            roleRepairer.run(creep);
        }
    }
};

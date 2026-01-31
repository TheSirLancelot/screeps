var roleHarvester = require("role.harvester");
var roleUpgrader = require("role.upgrader");
var roleBuilder = require("role.builder");
var roleRepairer = require("role.repairer");
var spawner = require("spawner");
var roleEvaluator = require("role.evaluator");
var roleManager = require("role.manager");
var creepUtils = require("creep.utils");
var towerManager = require("tower.manager");
var creepCalculator = require("creep.calculator");

module.exports.loop = function () {
    for (var name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log("Clearing non-existing creep memory:", name);
        }
    }

    // Assign roles to creeps based on room state
    roleManager.manageAllCreeps(Game.spawns["Spawn1"].room);

    const roleStats = roleManager.getRoleStats(Game.spawns["Spawn1"].room);
    console.log(
        `Active roles - Harvesters: ${roleStats.harvester}, Builders: ${roleStats.builder}, Upgraders: ${roleStats.upgrader}, Repairers: ${roleStats.repairer}`,
    );

    // Calculate ideal creep composition
    const recommendedMinCreeps = creepCalculator.calculateMinCreeps(
        Game.spawns["Spawn1"].room,
    );

    // Spawn new creeps if below minimum
    const creepCount = Object.keys(Game.creeps).length;
    spawner.run(creepCount, recommendedMinCreeps);

    // console.log("Total creeps: " + creepCount);

    if (Game.spawns["Spawn1"].spawning) {
        var spawningCreep = Game.creeps[Game.spawns["Spawn1"].spawning.name];
        Game.spawns["Spawn1"].room.visual.text(
            "🛠️" + spawningCreep.memory.role,
            Game.spawns["Spawn1"].pos.x + 1,
            Game.spawns["Spawn1"].pos.y,
            { align: "left", opacity: 0.8 },
        );
    }

    // Run tower logic for all rooms
    towerManager.runAll();

    // Pre-fetch terrain for efficiency (all creeps in same room for now)
    const terrain = Game.map.getRoomTerrain(Game.spawns["Spawn1"].room.name);

    for (var name in Game.creeps) {
        var creep = Game.creeps[name];

        // Perform common maintenance tasks
        creepUtils.maintain(creep, terrain);

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

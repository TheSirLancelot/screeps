var energySource = require("energy.source");

var roleBuilder = {
    /** @param {Creep} creep **/
    run: function (creep) {
        // TODO: If no construction sites, add fallback work (upgrade controller, repair, or rally).
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
            creep.say("⛏️");
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) {
            creep.memory.building = true;
            creep.say("🚧");
        }

        if (creep.memory.building) {
            var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (targets.length) {
                var target = creep.pos.findClosestByPath(targets);
                if (target) {
                    if (creep.build(target) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {
                            visualizePathStyle: { stroke: "#ffffff" },
                            reusePath: 20,
                        });
                    }
                }
            }
        } else {
            // Use committed energy source to prevent thrashing
            const target = energySource.findCommittedSource(creep);
            if (target) {
                energySource.collectFrom(creep, target);
            }
        }
    },
};

module.exports = roleBuilder;

var roleUpgrader = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.upgrading = false;
            creep.say("⛏️");
        }
        // Track previous upgrading state to avoid spamming say
        const prevUpgrading = creep.memory.upgrading;

        if (!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
            creep.memory.upgrading = true;
            creep.say("⚡");
        }

        if (creep.memory.upgrading) {
            if (
                creep.upgradeController(creep.room.controller) ==
                ERR_NOT_IN_RANGE
            ) {
                creep.moveTo(creep.room.controller, {
                    visualizePathStyle: { stroke: "#ffffff" },
                });
            }
        } else {
            var sources = creep.room.find(FIND_SOURCES);
            var stores = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    (structure.structureType == STRUCTURE_CONTAINER ||
                        structure.structureType == STRUCTURE_STORAGE) &&
                    structure.store[RESOURCE_ENERGY] > 0,
            });
            var targets = sources.concat(stores);
            var target = creep.pos.findClosestByPath(targets);
            if (!target) {
                return;
            }
            if (target.structureType) {
                if (
                    creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                    });
                }
            } else if (creep.harvest(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: "#ffaa00" },
                });
            }
        }
        // Announce state changes: ⚡ for upgrading, ⛏️ for harvesting
        if (creep.memory.upgrading === true && prevUpgrading !== true) {
            creep.say("⚡");
        }
        if (creep.memory.upgrading === false && prevUpgrading !== false) {
            creep.say("⛏️");
        }
    },
};

module.exports = roleUpgrader;

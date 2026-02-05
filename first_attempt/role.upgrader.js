var energySource = require("energy.source");

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
            // Check if nearby tower needs energy before upgrading
            const nearbyTowers = creep.pos.findInRange(FIND_STRUCTURES, 10, {
                filter: (structure) =>
                    structure.structureType === STRUCTURE_TOWER &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            });

            if (nearbyTowers.length > 0 && creep.store[RESOURCE_ENERGY] > 0) {
                const closestTower = creep.pos.findClosestByPath(nearbyTowers);
                if (closestTower) {
                    if (
                        creep.transfer(closestTower, RESOURCE_ENERGY) ==
                        ERR_NOT_IN_RANGE
                    ) {
                        creep.moveTo(closestTower, {
                            visualizePathStyle: { stroke: "#ffff00" },
                            reusePath: 5,
                        });
                        return; // Don't upgrade this tick, fill tower first
                    }
                }
            }

            // Upgrade controller
            if (
                creep.upgradeController(creep.room.controller) ==
                ERR_NOT_IN_RANGE
            ) {
                creep.moveTo(creep.room.controller, {
                    visualizePathStyle: { stroke: "#ffffff" },
                    reusePath: 20,
                });
            }
        } else {
            // Use committed energy source to prevent thrashing
            const target = energySource.findCommittedSource(creep);
            if (target) {
                energySource.collectFrom(creep, target);
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

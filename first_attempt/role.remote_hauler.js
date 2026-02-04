/**
 * Role: Remote Hauler
 * Collects energy in a target room and delivers it back to the home room.
 *
 * CONSOLE COMMANDS TO USE:
 *
 * 1. Spawn a remote hauler (replace room/spawn names):
 *    Game.spawns['Spawn1'].spawnCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], 'RemoteHauler1', {memory: {role: 'remote_hauler', targetRoom: 'W1N1', homeRoom: 'W1N2', fixedRole: true}});
 */

var roleRemoteHauler = {
    /** @param {Creep} creep **/
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        if (!targetRoom) {
            console.log(`Remote hauler ${creep.name} has no targetRoom set!`);
            return;
        }

        if (!creep.memory.homeRoom) {
            creep.memory.homeRoom = creep.room.name;
        }
        const homeRoom = creep.memory.homeRoom;

        if (creep.memory.hauling === undefined) {
            creep.memory.hauling = true;
        }

        if (creep.memory.hauling && creep.store.getFreeCapacity() === 0) {
            creep.memory.hauling = false;
        }
        if (!creep.memory.hauling && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.hauling = true;
        }

        if (creep.memory.hauling && creep.room.name !== targetRoom) {
            const targetPos = new RoomPosition(25, 25, targetRoom);
            creep.moveTo(targetPos, {
                visualizePathStyle: { stroke: "#ffaa00" },
                reusePath: 50,
            });
            return;
        }

        if (!creep.memory.hauling && creep.room.name !== homeRoom) {
            const homePos = new RoomPosition(25, 25, homeRoom);
            creep.moveTo(homePos, {
                visualizePathStyle: { stroke: "#ffffff" },
                reusePath: 50,
            });
            return;
        }

        if (creep.memory.hauling) {
            // Basic energy pickup: dropped energy > tombstones > containers > storage
            var target = null;

            var dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
                filter: (resource) => resource.resourceType === RESOURCE_ENERGY,
            });
            if (dropped.length > 0) {
                target = creep.pos.findClosestByPath(dropped);
                if (target && creep.pickup(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                        reusePath: 20,
                    });
                }
                return;
            }

            var tombstones = creep.room.find(FIND_TOMBSTONES, {
                filter: (tombstone) => tombstone.store[RESOURCE_ENERGY] > 0,
            });
            if (tombstones.length > 0) {
                target = creep.pos.findClosestByPath(tombstones);
                if (
                    target &&
                    creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffaa00" },
                        reusePath: 20,
                    });
                }
                return;
            }

            var containers = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.structureType === STRUCTURE_CONTAINER &&
                    structure.store[RESOURCE_ENERGY] > 0,
            });

            if (containers.length > 0) {
                target = creep.pos.findClosestByPath(containers);
            } else {
                var storage = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.structureType === STRUCTURE_STORAGE &&
                        structure.store[RESOURCE_ENERGY] > 0,
                });
                if (storage.length > 0) {
                    target = creep.pos.findClosestByPath(storage);
                }
            }

            if (
                target &&
                creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE
            ) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: "#ffaa00" },
                    reusePath: 20,
                });
            }
        } else {
            // Deliver energy only to storage in home room
            var storage = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    structure.structureType === STRUCTURE_STORAGE &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            });

            if (storage.length > 0) {
                var target = creep.pos.findClosestByPath(storage);
                if (
                    target &&
                    creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: "#ffffff" },
                        reusePath: 20,
                    });
                }
            }
        }
    },
};

module.exports = roleRemoteHauler;

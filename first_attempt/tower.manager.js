/**
 * Tower Manager
 * Handles all tower logic for defense and repair
 */

var towerManager = {
    /**
     * Run tower logic for all towers in a room
     * Prioritizes attacking hostiles, then repairing damaged structures
     * @param {Room} room - The room to manage towers in
     */
    run: function (room) {
        const towers = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_TOWER,
        });

        for (let i = 0; i < towers.length; i++) {
            const tower = towers[i];

            // Priority 1: Attack hostile creeps
            const closestHostile =
                tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            if (closestHostile) {
                tower.attack(closestHostile);
                continue; // Skip repair when attacking
            }

            // Priority 2: Repair damaged structures (excluding walls and roads)
            const closestDamagedStructure = tower.pos.findClosestByRange(
                FIND_STRUCTURES,
                {
                    filter: (structure) =>
                        structure.hits < structure.hitsMax &&
                        structure.structureType !== STRUCTURE_WALL &&
                        structure.structureType !== STRUCTURE_ROAD,
                },
            );
            if (closestDamagedStructure) {
                tower.repair(closestDamagedStructure);
            }
        }
    },

    /**
     * Run tower logic for all rooms
     */
    runAll: function () {
        for (const roomName in Game.rooms) {
            this.run(Game.rooms[roomName]);
        }
    },
};

module.exports = towerManager;

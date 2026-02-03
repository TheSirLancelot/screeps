/**
 * Energy Source Manager
 * Handles committed energy source selection for generic creeps
 * Prevents thrashing between containers/sources
 */

var energySource = {
    /**
     * Find and commit to an energy source for a creep
     * Prioritizes: Storage > Containers > Sources
     * Once committed, sticks to that source until empty
     *
     * @param {Creep} creep - The creep looking for energy
     * @returns {Structure|Source|null} - The energy source to use
     */
    findCommittedSource: function (creep) {
        var target = null;

        // Check if we have a committed source
        if (creep.memory.energySourceId) {
            const committedSource = Game.getObjectById(
                creep.memory.energySourceId,
            );

            if (committedSource) {
                // Check if it still has energy
                const hasEnergy = committedSource.energy
                    ? committedSource.energy > 0 // Source
                    : committedSource.store &&
                      committedSource.store[RESOURCE_ENERGY] > 0; // Structure

                if (hasEnergy) {
                    return committedSource;
                } else {
                    // Empty, clear commitment
                    delete creep.memory.energySourceId;
                }
            } else {
                // No longer exists, clear commitment
                delete creep.memory.energySourceId;
            }
        }

        // No valid commitment, find a new source
        // Priority 1: Storage
        var storage = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                structure.structureType == STRUCTURE_STORAGE &&
                structure.store[RESOURCE_ENERGY] > 0,
        });

        if (storage.length > 0) {
            target = storage[0]; // Only one storage per room
            creep.memory.energySourceId = target.id;
            return target;
        }

        // Priority 2: Containers (avoid dedicated hauler assignments)
        const dedicatedHaulers = creep.room.find(FIND_MY_CREEPS, {
            filter: (c) =>
                c.memory.role === "hauler" &&
                c.memory.fixedRole === true &&
                c.memory.assignedContainerId,
        });
        const assignedContainerIds = dedicatedHaulers.map(
            (h) => h.memory.assignedContainerId,
        );

        var containers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) =>
                structure.structureType == STRUCTURE_CONTAINER &&
                structure.store[RESOURCE_ENERGY] > 0 &&
                !assignedContainerIds.includes(structure.id), // Avoid dedicated hauler containers
        });

        if (containers.length > 0) {
            // Pick closest available container
            target = creep.pos.findClosestByPath(containers);
            if (target) {
                creep.memory.energySourceId = target.id;
                return target;
            }
        }

        // Priority 3: Sources (fallback if no storage/containers)
        var sources = creep.room.find(FIND_SOURCES, {
            filter: (source) => source.energy > 0,
        });

        if (sources.length > 0) {
            target = creep.pos.findClosestByPath(sources);
            if (target) {
                creep.memory.energySourceId = target.id;
                return target;
            }
        }

        return null;
    },

    /**
     * Withdraw or harvest from the committed source
     * Handles both structures (withdraw) and sources (harvest)
     *
     * @param {Creep} creep - The creep gathering energy
     * @param {Structure|Source} target - The energy source
     * @returns {boolean} - True if action was taken
     */
    collectFrom: function (creep, target) {
        if (!target) return false;

        let result;
        if (target.energy !== undefined) {
            // It's a Source, harvest from it
            result = creep.harvest(target);
        } else {
            // It's a Structure, withdraw from it
            result = creep.withdraw(target, RESOURCE_ENERGY);
        }

        if (result == ERR_NOT_IN_RANGE) {
            creep.moveTo(target, {
                visualizePathStyle: { stroke: "#ffaa00" },
                reusePath: 20,
            });
            return true;
        }

        return result === OK;
    },
};

module.exports = energySource;

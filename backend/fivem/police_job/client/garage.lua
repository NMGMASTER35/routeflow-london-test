local QBCore = exports['qb-core']:GetCoreObject()

local PlayerJob = {}

local function isPolice()
    return PlayerJob.name == Config.JobName
end

local function getVehiclesForType(vehicleType)
    local authorized = {}
    if not isPolice() then return authorized end
    local grade = PlayerJob.grade and PlayerJob.grade.level or 0
    local pool = Config.AuthorizedVehicles[vehicleType] or {}
    for requiredGrade, vehicles in pairs(pool) do
        if grade >= requiredGrade then
            for _, info in ipairs(vehicles) do
                authorized[#authorized + 1] = info
            end
        end
    end
    table.sort(authorized, function(a, b)
        return (a.label or a.model) < (b.label or b.model)
    end)
    return authorized
end

RegisterNetEvent('police:client:HandleGarageMenu', function(data)
    local playerData = QBCore.Functions.GetPlayerData()
    PlayerJob = playerData.job or {}
    if not isPolice() then return end

    local vehicleType = data and data.type or 'patrol'
    local spawnIndex = data and data.spawnIndex or 1
    local vehicles = getVehiclesForType(vehicleType)

    if #vehicles == 0 then
        QBCore.Functions.Notify('No vehicles available for your rank', 'error')
        return
    end

    local menu = {
        {
            header = ('%s Garage'):format(vehicleType:gsub('^%l', string.upper)),
            isMenuHeader = true
        }
    }

    for _, info in ipairs(vehicles) do
        menu[#menu + 1] = {
            header = info.label or info.model,
            txt = ('Model: %s'):format(info.model),
            params = {
                event = 'police:client:SpawnGarageVehicle',
                args = {
                    type = vehicleType,
                    model = info.model,
                    spawnIndex = spawnIndex,
                    extras = info.extras,
                    livery = info.livery,
                    fuel = info.fuel
                }
            }
        }
    end

    menu[#menu + 1] = {
        header = 'Close',
        params = { event = 'qb-menu:client:closeMenu' }
    }

    exports['qb-menu']:openMenu(menu)
end)

RegisterNetEvent('police:client:HandleHeliMenu', function(data)
    local playerData = QBCore.Functions.GetPlayerData()
    PlayerJob = playerData.job or {}
    if not isPolice() then return end

    local grade = PlayerJob.grade and PlayerJob.grade.level or 0
    local options = {}
    for requiredGrade, helicopters in pairs(Config.AuthorizedHelicopters or {}) do
        if grade >= requiredGrade then
            for _, info in ipairs(helicopters) do
                options[#options + 1] = info
            end
        end
    end

    if #options == 0 then
        QBCore.Functions.Notify('You are not cleared for air support', 'error')
        return
    end

    local menu = {
        {
            header = 'Helicopter Hangar',
            isMenuHeader = true
        }
    }

    for _, info in ipairs(options) do
        menu[#menu + 1] = {
            header = info.label or info.model,
            txt = ('Model: %s'):format(info.model),
            params = {
                event = 'police:client:SpawnHelicopter',
                args = {
                    model = info.model,
                    spawnIndex = data and data.spawnIndex or 1,
                    extras = info.extras,
                    livery = info.livery,
                    fuel = info.fuel
                }
            }
        }
    end

    menu[#menu + 1] = {
        header = 'Close',
        params = { event = 'qb-menu:client:closeMenu' }
    }

    exports['qb-menu']:openMenu(menu)
end)

RegisterNetEvent('police:client:SpawnGarageVehicle', function(data)
    if not data or not data.model then return end
    TriggerServerEvent('police:server:SpawnVehicle', data)
end)

RegisterNetEvent('police:client:SpawnHelicopter', function(data)
    if not data or not data.model then return end
    TriggerServerEvent('police:server:SpawnHelicopter', data)
end)

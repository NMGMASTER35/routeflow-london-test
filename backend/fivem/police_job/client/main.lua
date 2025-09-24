local QBCore = exports['qb-core']:GetCoreObject()

local PlayerJob = {}
local onDuty = false
local createdZones = {}

local function isOnPoliceDuty()
    return PlayerJob.name == Config.JobName and onDuty
end

local function clearTargetZones()
    if not Config.UseTarget then return end
    for name in pairs(createdZones) do
        exports['qb-target']:RemoveZone(name)
    end
    createdZones = {}
end

local function addBoxZone(name, coords, length, width, options)
    if not Config.UseTarget then return end
    length = length or 1.0
    width = width or 1.0
    local heading = coords.w or 0.0
    local position = vector3(coords.x, coords.y, coords.z)
    exports['qb-target']:RemoveZone(name)
    exports['qb-target']:AddBoxZone(name, position, length, width, {
        name = name,
        heading = heading,
        minZ = coords.z - 1.0,
        maxZ = coords.z + 1.0,
        debugPoly = false
    }, {
        options = options,
        distance = 2.5
    })
    createdZones[name] = true
end

local function setupTargets()
    clearTargetZones()
    if PlayerJob.name ~= Config.JobName or not Config.UseTarget then return end

    for index, coords in ipairs(Config.Locations.duty or {}) do
        addBoxZone(('police-duty-%s'):format(index), coords, 1.6, 1.6, {
            {
                type = 'client',
                event = 'police:client:ToggleDuty',
                icon = 'fas fa-clock',
                label = 'Toggle Duty'
            }
        })
    end

    for index, data in ipairs(Config.Locations.vehicle or {}) do
        addBoxZone(('police-vehicle-%s'):format(index), data.coords, 5.0, 6.0, {
            {
                type = 'client',
                event = 'police:client:OpenVehicleGarage',
                icon = 'fas fa-car',
                label = 'Police Garage',
                args = {
                    type = data.type or 'patrol',
                    spawnIndex = index
                }
            }
        })
    end

    for index, data in ipairs(Config.Locations.helicopter or {}) do
        addBoxZone(('police-heli-%s'):format(index), data.coords, 5.0, 5.0, {
            {
                type = 'client',
                event = 'police:client:OpenHelicopterGarage',
                icon = 'fas fa-helicopter',
                label = 'Helicopter Garage',
                args = { spawnIndex = index }
            }
        })
    end

    for index, coords in ipairs(Config.Locations.stash or {}) do
        addBoxZone(('police-stash-%s'):format(index), coords, 1.4, 1.4, {
            {
                type = 'client',
                event = 'police:client:OpenPersonalLocker',
                icon = 'fas fa-box-open',
                label = 'Open Locker'
            }
        })
    end

    for index, coords in ipairs(Config.Locations.armory or {}) do
        addBoxZone(('police-armory-%s'):format(index), coords, 1.6, 1.6, {
            {
                type = 'client',
                event = 'police:client:OpenArmory',
                icon = 'fas fa-warehouse',
                label = 'Open Armory'
            }
        })
    end

    for index, coords in ipairs(Config.Locations.trash or {}) do
        addBoxZone(('police-trash-%s'):format(index), coords, 1.4, 1.4, {
            {
                type = 'client',
                event = 'police:client:OpenTrash',
                icon = 'fas fa-dumpster',
                label = 'Open Trash'
            }
        })
    end

    for index, coords in ipairs(Config.Locations.fingerprint or {}) do
        addBoxZone(('police-fingerprint-%s'):format(index), coords, 1.4, 1.4, {
            {
                type = 'client',
                event = 'police:client:UseFingerprint',
                icon = 'fas fa-fingerprint',
                label = 'Fingerprint Scanner'
            }
        })
    end

    for index, data in ipairs(Config.Locations.evidence or {}) do
        addBoxZone(('police-evidence-%s'):format(index), data.coords, 1.4, 1.4, {
            {
                type = 'client',
                event = 'police:client:OpenEvidence',
                icon = 'fas fa-archive',
                label = ('Evidence Locker %s'):format(data.stash),
                args = { stash = data.stash }
            }
        })
    end
end

local function ensureDutyState()
    if PlayerJob.name == Config.JobName then
        onDuty = PlayerJob.onduty
        if Config.DefaultDuty and not onDuty then
            TriggerServerEvent('QBCore:ToggleDuty')
        end
    end
end

local function handleJobUpdate(jobInfo)
    PlayerJob = jobInfo
    ensureDutyState()
    setupTargets()
end

local function initJob()
    local playerData = QBCore.Functions.GetPlayerData()
    if playerData and playerData.job then
        PlayerJob = playerData.job
        onDuty = playerData.job.onduty
        setupTargets()
        ensureDutyState()
    end
end

RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    initJob()
end)

RegisterNetEvent('QBCore:Client:OnPlayerUnload', function()
    clearTargetZones()
    PlayerJob = {}
    onDuty = false
end)

RegisterNetEvent('QBCore:Client:OnJobUpdate', function(jobInfo)
    handleJobUpdate(jobInfo)
end)

RegisterNetEvent('QBCore:Client:SetDuty', function(duty)
    onDuty = duty
end)

RegisterNetEvent('police:client:ToggleDuty', function()
    if PlayerJob.name ~= Config.JobName then return end
    TriggerServerEvent('QBCore:ToggleDuty')
end)

RegisterNetEvent('police:client:OpenPersonalLocker', function()
    if not isOnPoliceDuty() then return end
    TriggerServerEvent('police:server:OpenLocker')
end)

RegisterNetEvent('police:client:OpenArmory', function()
    if not isOnPoliceDuty() then return end
    TriggerServerEvent('police:server:OpenArmory')
end)

RegisterNetEvent('police:client:OpenTrash', function()
    if not isOnPoliceDuty() then return end
    TriggerServerEvent('police:server:OpenTrash')
end)

RegisterNetEvent('police:client:OpenEvidence', function(data)
    if not isOnPoliceDuty() then return end
    if not data or not data.stash then return end
    TriggerServerEvent('police:server:OpenEvidence', data.stash)
end)

RegisterNetEvent('police:client:UseFingerprint', function()
    if not isOnPoliceDuty() then return end
    local player, distance = QBCore.Functions.GetClosestPlayer()
    if player ~= -1 and distance <= 2.0 then
        QBCore.Functions.Progressbar('scan-fingerprint', 'Scanning fingerprint...', Config.FingerprintWait, false, true, {
            disableMovement = true,
            disableCarMovement = true,
            disableMouse = false,
            disableCombat = true
        }, {}, {}, {}, function()
            local targetId = GetPlayerServerId(player)
            TriggerServerEvent('police:server:ShowFingerprint', targetId)
        end)
    else
        QBCore.Functions.Notify('No suspect nearby', 'error')
    end
end)

RegisterNetEvent('police:client:OpenVehicleGarage', function(data)
    TriggerEvent('police:client:HandleGarageMenu', data)
end)

RegisterNetEvent('police:client:OpenHelicopterGarage', function(data)
    TriggerEvent('police:client:HandleHeliMenu', data)
end)

RegisterNetEvent('police:client:VehicleSpawned', function(netId, meta)
    if not netId or netId == 0 then return end
    local veh = NetToVeh(netId)
    if not DoesEntityExist(veh) then return end
    SetVehicleEngineOn(veh, true, true, false)
    SetVehicleDirtLevel(veh, 0.0)
    if meta then
        if meta.fuel then
            if not pcall(function() exports['LegacyFuel']:SetFuel(veh, meta.fuel) end) then
                pcall(function() exports['cdn-fuel']:SetFuel(veh, meta.fuel) end)
            end
        end
        if meta.livery then
            SetVehicleLivery(veh, meta.livery)
        end
        if meta.extras then
            for extraId, enabled in pairs(meta.extras) do
                SetVehicleExtra(veh, tonumber(extraId), not enabled)
            end
        end
    end
end)

RegisterNetEvent('police:client:ShowFingerprint', function(data)
    if data and data.fingerprint then
        QBCore.Functions.Notify(('Fingerprint match: %s'):format(data.fingerprint), 'primary', 7500)
    else
        QBCore.Functions.Notify('Fingerprint scan inconclusive', 'error', 5000)
    end
end)

CreateThread(function()
    Wait(1000)
    initJob()
end)

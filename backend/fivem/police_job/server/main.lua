local QBCore = exports['qb-core']:GetCoreObject()

local function isPolice(Player)
    return Player and Player.PlayerData.job and Player.PlayerData.job.name == Config.JobName
end

local function isOnDuty(Player)
    return isPolice(Player) and Player.PlayerData.job.onduty
end

local function openStash(src, stashId, label, weight, slots)
    exports['qb-inventory']:CreateStash(stashId, label, slots, weight)
    TriggerClientEvent('inventory:client:OpenInventory', src, 'stash', stashId, {
        maxweight = weight,
        slots = slots
    })
    TriggerClientEvent('inventory:client:SetCurrentStash', src, stashId)
end

local function getAuthorizedVehicle(vehicleType, grade, model)
    local pool = Config.AuthorizedVehicles[vehicleType]
    if not pool then return nil end

    local selected
    for requiredGrade, vehicles in pairs(pool) do
        if grade >= requiredGrade then
            for _, info in ipairs(vehicles) do
                if info.model == model then
                    selected = info
                end
            end
        end
    end
    return selected
end

local function giveVehicleKeys(src, plate)
    TriggerClientEvent('vehiclekeys:client:SetOwner', src, plate)
    if GetResourceState('qb-vehiclekeys') == 'started' then
        pcall(function()
            exports['qb-vehiclekeys']:SetVehicleKey(plate, true)
        end)
    end
end

RegisterNetEvent('police:server:OpenLocker', function()
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not isOnDuty(Player) then return end

    local stashId = ('police_locker_%s'):format(Player.PlayerData.citizenid)
    openStash(src, stashId, 'Personal Locker', Config.LockerStashWeight, Config.LockerStashSlots)
end)

RegisterNetEvent('police:server:OpenArmory', function()
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not isOnDuty(Player) then return end

    openStash(src, 'police_armory', 'Police Armory', Config.ArmoryStashWeight, Config.ArmoryStashSlots)
end)

RegisterNetEvent('police:server:OpenTrash', function()
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not isOnDuty(Player) then return end

    openStash(src, 'police_trash', 'Police Trash', Config.TrashStashWeight, Config.TrashStashSlots)
end)

RegisterNetEvent('police:server:OpenEvidence', function(stashId)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not isOnDuty(Player) then return end
    if not stashId then return end

    local stash = ('police_evidence_%s'):format(stashId)
    openStash(src, stash, ('Evidence Locker %s'):format(stashId), Config.EvidenceStashWeight, Config.EvidenceStashSlots)
end)

RegisterNetEvent('police:server:CreateEvidenceBag', function(metadata)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not isOnDuty(Player) then return end

    metadata = metadata or {}
    metadata.officer = Player.PlayerData.charinfo.firstname .. ' ' .. Player.PlayerData.charinfo.lastname
    metadata.callsign = Player.PlayerData.metadata and Player.PlayerData.metadata['callsign'] or '000'

    if Player.Functions.AddItem('evidencebag', 1, false, metadata) then
        TriggerClientEvent('inventory:client:ItemBox', src, QBCore.Shared.Items['evidencebag'], 'add')
    else
        TriggerClientEvent('QBCore:Notify', src, 'Inventory full', 'error')
    end
end)

RegisterNetEvent('police:server:UpdateBodycamLog', function()
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not isOnDuty(Player) then return end

    Player.Functions.SetMetaData('bodycam', os.time())
end)

RegisterNetEvent('police:server:ShowFingerprint', function(targetId)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not isOnDuty(Player) then return end

    local Target = QBCore.Functions.GetPlayer(targetId)
    if not Target then
        TriggerClientEvent('QBCore:Notify', src, 'No person nearby to scan', 'error')
        return
    end

    local fingerprint = Target.PlayerData.metadata and (Target.PlayerData.metadata['fingerprint'] or Target.PlayerData.citizenid) or Target.PlayerData.citizenid
    TriggerClientEvent('police:client:ShowFingerprint', src, {
        fingerprint = fingerprint,
        citizenid = Target.PlayerData.citizenid,
        name = string.format('%s %s', Target.PlayerData.charinfo.firstname, Target.PlayerData.charinfo.lastname)
    })
end)

RegisterNetEvent('police:server:SpawnVehicle', function(data)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not isOnDuty(Player) then return end
    if not data or not data.model or not data.spawnIndex then return end

    local spawnConfig = Config.Locations.vehicle[data.spawnIndex]
    if not spawnConfig then return end

    local grade = Player.PlayerData.job.grade.level
    local info = getAuthorizedVehicle(data.type or spawnConfig.type or 'patrol', grade, data.model)
    if not info then
        TriggerClientEvent('QBCore:Notify', src, 'You are not authorized to take this vehicle', 'error')
        return
    end

    local coords = spawnConfig.coords
    QBCore.Functions.SpawnVehicle(src, info.model, coords, coords.w, function(veh)
        if not veh then return end
        local plate = data.plate or ('POL' .. math.random(100, 999))
        SetVehicleNumberPlateText(veh, plate)
        SetVehicleDirtLevel(veh, 0.0)
        giveVehicleKeys(src, plate)
        local netId = NetworkGetNetworkIdFromEntity(veh)
        TriggerClientEvent('police:client:VehicleSpawned', src, netId, info)
    end, true)
end)

RegisterNetEvent('police:server:SpawnHelicopter', function(data)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not isOnDuty(Player) then return end
    if not data or not data.model or not data.spawnIndex then return end

    local spawnConfig = Config.Locations.helicopter[data.spawnIndex]
    if not spawnConfig then return end

    local grade = Player.PlayerData.job.grade.level
    local authorized = false
    local selectedInfo
    for requiredGrade, helicopters in pairs(Config.AuthorizedHelicopters or {}) do
        if grade >= requiredGrade then
            for _, info in ipairs(helicopters) do
                if info.model == data.model then
                    authorized = true
                    selectedInfo = info
                end
            end
        end
    end

    if not authorized then
        TriggerClientEvent('QBCore:Notify', src, 'You are not cleared for this aircraft', 'error')
        return
    end

    local coords = spawnConfig.coords
    QBCore.Functions.SpawnVehicle(src, selectedInfo.model, coords, coords.w, function(veh)
        if not veh then return end
        local plate = data.plate or ('AIR' .. math.random(100, 999))
        SetVehicleNumberPlateText(veh, plate)
        SetVehicleDirtLevel(veh, 0.0)
        giveVehicleKeys(src, plate)
        local netId = NetworkGetNetworkIdFromEntity(veh)
        TriggerClientEvent('police:client:VehicleSpawned', src, netId, selectedInfo)
    end, true)
end)

QBCore.Functions.CreateCallback('police:server:IsWhitelistedChannel', function(_, cb, channel)
    cb(Config.WhitelistedRadioChannels[channel] == true)
end)

QBCore.Functions.CreateCallback('police:server:GetArmoryItems', function(source, cb)
    local Player = QBCore.Functions.GetPlayer(source)
    if not isOnDuty(Player) then
        cb({})
        return
    end

    local grade = Player.PlayerData.job.grade.level
    local items = {}
    for requiredGrade, gradeItems in pairs(Config.AuthorizedArmory or {}) do
        if grade >= requiredGrade then
            for _, item in ipairs(gradeItems) do
                items[#items + 1] = item
            end
        end
    end
    cb(items)
end)

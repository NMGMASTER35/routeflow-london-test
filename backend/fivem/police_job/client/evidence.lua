local QBCore = exports['qb-core']:GetCoreObject()

local function isPoliceOnDuty()
    local playerData = QBCore.Functions.GetPlayerData()
    if not playerData or not playerData.job then return false end
    return playerData.job.name == Config.JobName and playerData.job.onduty
end

local function buildEvidenceMetadata(description)
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local streetHash, crossingHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    local streetName = GetStreetNameFromHashKey(streetHash)
    local crossing = GetStreetNameFromHashKey(crossingHash)
    local area = streetName
    if crossing ~= '' then
        area = ('%s / %s'):format(streetName, crossing)
    end

    return {
        location = area,
        description = description or 'Collected evidence',
        coords = { x = coords.x, y = coords.y, z = coords.z },
        time = os.date('%Y-%m-%d %H:%M:%S')
    }
end

RegisterNetEvent('police:client:CreateEvidenceBag', function(data)
    if not isPoliceOnDuty() then
        QBCore.Functions.Notify('You must be on duty to collect evidence', 'error')
        return
    end

    local description = data and data.description or 'Evidence sample'
    QBCore.Functions.Progressbar('collect-evidence', 'Bagging Evidence...', 5000, false, true, {
        disableMovement = true,
        disableCarMovement = true,
        disableMouse = false,
        disableCombat = true
    }, {}, {}, {}, function()
        local metadata = buildEvidenceMetadata(description)
        TriggerServerEvent('police:server:CreateEvidenceBag', metadata)
        QBCore.Functions.Notify('Evidence bag sealed and added to your inventory', 'success')
    end)
end)

RegisterNetEvent('police:client:UseBodycam', function()
    if not isPoliceOnDuty() then return end
    QBCore.Functions.Notify('Bodycam recording timestamp updated', 'primary')
    TriggerServerEvent('police:server:UpdateBodycamLog')
end)

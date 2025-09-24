Config = {}

Config.JobName = 'police'
Config.DefaultDuty = true
Config.UseTarget = true
Config.HandcuffTimerEnabled = true
Config.HandcuffTimer = 10 * 60000 -- 10 minutes
Config.EvidenceStashWeight = 400000
Config.EvidenceStashSlots = 50
Config.LockerStashWeight = 300000
Config.LockerStashSlots = 40
Config.ArmoryStashWeight = 250000
Config.ArmoryStashSlots = 60
Config.TrashStashWeight = 60000
Config.TrashStashSlots = 30
Config.FingerprintWait = 4000
Config.MinBail = 200
Config.MaxBail = 5000

Config.WhitelistedRadioChannels = {
    [1] = true,
    [2] = true,
    [3] = true,
    [4] = true,
    [5] = true
}

Config.AuthorizedVehicles = {
    patrol = {
        [0] = {
            { model = 'police', label = 'Vapid Police Cruiser', livery = 0, fuel = 100 },
            { model = 'police3', label = 'Police Interceptor', livery = 0, fuel = 100 }
        },
        [2] = {
            { model = 'police4', label = 'Undercover Buffalo', livery = 0, fuel = 100 }
        },
        [3] = {
            { model = 'fbi', label = 'FIB Buffalo', livery = 0, fuel = 100 }
        }
    },
    traffic = {
        [1] = {
            { model = 'police2', label = 'Vapid Buffalo S', livery = 0, fuel = 100 }
        },
        [3] = {
            { model = 'policeb', label = 'Police Bike', livery = 0, fuel = 100 }
        }
    }
}

Config.AuthorizedHelicopters = {
    [2] = {
        { model = 'polmav', label = 'Police Maverick', livery = 0, fuel = 100 }
    }
}

Config.AuthorizedArmory = {
    [0] = {
        { name = 'weapon_stungun', label = 'Taser', type = 'weapon', price = 0 },
        { name = 'weapon_nightstick', label = 'Nightstick', type = 'weapon', price = 0 },
        { name = 'pistol_ammo', label = '9mm Ammo', type = 'item', amount = 5, price = 0 }
    },
    [1] = {
        { name = 'weapon_combatpistol', label = 'Combat Pistol', type = 'weapon', price = 0 },
        { name = 'armor', label = 'Body Armor', type = 'item', amount = 2, price = 0 }
    },
    [2] = {
        { name = 'weapon_carbinerifle', label = 'Carbine Rifle', type = 'weapon', price = 0 },
        { name = 'rifle_ammo', label = '5.56 Ammo', type = 'item', amount = 5, price = 0 }
    }
}

Config.Locations = {
    duty = {
        vector4(441.13, -981.04, 30.69, 90.0),
        vector4(1851.21, 3689.51, 34.27, 210.87)
    },
    vehicle = {
        { coords = vector4(445.85, -986.67, 25.7, 89.5), type = 'patrol' },
        { coords = vector4(452.06, -1018.41, 28.45, 90.0), type = 'traffic' }
    },
    helicopter = {
        { coords = vector4(449.68, -981.24, 43.69, 87.19) }
    },
    stash = {
        vector4(452.35, -995.7, 30.69, 178.0)
    },
    armory = {
        vector4(481.93, -995.34, 30.69, 93.92)
    },
    trash = {
        vector4(456.24, -988.41, 24.7, 180.0)
    },
    fingerprint = {
        vector4(473.08, -1007.43, 26.27, 90.0)
    },
    evidence = {
        { stash = '1', coords = vector4(475.01, -996.32, 26.27, 91.53) },
        { stash = '2', coords = vector4(473.16, -996.34, 26.27, 270.93) }
    },
    impound = {
        vector3(436.18, -996.73, 25.45)
    },
    jail = {
        exit = vector4(1775.5, 2593.48, 45.72, 269.91),
        yard = vector4(1764.05, 2569.9, 45.57, 91.02)
    }
}


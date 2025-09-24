fx_version 'cerulean'

game 'gta5'

description 'QB-Style Police Job'

author 'RouteFlow London Test Conversion'

version '1.0.0'

shared_script 'config.lua'

client_scripts {
    '@PolyZone/client.lua',
    '@PolyZone/BoxZone.lua',
    '@PolyZone/ComboZone.lua',
    'client/main.lua',
    'client/garage.lua',
    'client/evidence.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua'
}

dependencies {
    'qb-core',
    'qb-target',
    'qb-menu',
    'qb-input'
}

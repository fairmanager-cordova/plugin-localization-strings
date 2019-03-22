#!/usr/bin/env node

"use strict";

const scriptIos     = require( "./createIosStrings" );
const scriptAndroid = require( "./createAndroidStrings" );
const Q             = require( "q" );

/**
 * @param {any} context
 * @returns {Promise<any>}
 */
function createStrings( context ) {
	const platforms = context.requireCordovaModule( "cordova-lib/src/cordova/util" ).listPlatforms( context.opts.projectRoot );
	const promises  = [];

	if( platforms.indexOf( "ios" ) >= 0 ) {
		promises.push( scriptIos( context ) );
	}

	if( platforms.indexOf( "android" ) >= 0 ) {
		promises.push( scriptAndroid( context ) );
	}

	return Q.all( promises );
}

module.exports = createStrings;

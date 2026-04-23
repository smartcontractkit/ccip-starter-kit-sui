/**
 * Configuration for package upgrade tracking
 */
export interface PackageUpgradeConfig {
    moduleName: string;
    statePointerType: string;
    parentObjectFieldName: string;
    stateObjectName: string;
    packageIdsFieldName?: string;
}

/**
 * Predefined package configurations for CCIP packages
 */
export const PACKAGE_UPGRADE_CONFIGS: Record<string, PackageUpgradeConfig> = {
    'ccip_onramp': {
        moduleName: 'onramp',
        statePointerType: 'OnRampStatePointer',
        parentObjectFieldName: 'on_ramp_object_id',
        stateObjectName: 'OnRampState',
    },
    'ccip_offramp': {
        moduleName: 'offramp',
        statePointerType: 'OffRampStatePointer',
        parentObjectFieldName: 'off_ramp_object_id',
        stateObjectName: 'OffRampState',
    },
    'ccip': {
        moduleName: 'state_object',
        statePointerType: 'CCIPObjectRefPointer',
        parentObjectFieldName: 'ccip_object_id',
        stateObjectName: 'CCIPObjectRef',
    },
};

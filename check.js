const { Project } = require('ts-morph');
const project = new Project();
const sf = project.addSourceFileAtPath('node_modules/@wix/auto_sdk_ecom_checkout/build/cjs/index.d.ts');
sf.getInterfaces().forEach(i => {
    if (i.getName() === 'GetCheckoutPaymentSettingsResponse' || i.getName() === 'CheckoutPaymentSettings') {
        console.log(i.getName());
        i.getProperties().forEach(p => console.log('  ' + p.getName() + ': ' + p.getType().getText()));
    }
});

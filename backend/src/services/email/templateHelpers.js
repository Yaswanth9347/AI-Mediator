// Shared Email Template Styles
export const baseStyles = `
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
    .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
`;

export const buttonStyle = (color) => `
    display: inline-block; 
    padding: 12px 30px; 
    background-color: ${color}; 
    color: white; 
    text-decoration: none; 
    border-radius: 5px; 
    margin: 20px 0;
`;

export const alertBox = (bgColor, borderColor) => `
    background-color: ${bgColor}; 
    border-left: 4px solid ${borderColor}; 
    padding: 15px; 
    margin: 20px 0;
`;

export const headerStyle = (bgColor) => `
    background-color: ${bgColor}; 
    color: white; 
    padding: 20px; 
    text-align: center; 
    border-radius: 8px 8px 0 0;
`;

export const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';
export const getCurrentYear = () => new Date().getFullYear();

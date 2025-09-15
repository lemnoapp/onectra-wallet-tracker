{ pkgs }: {
  deps = [
    pkgs.nodejs-18_x
    pkgs.nodePackages.npm
    pkgs.nodePackages.pm2
    pkgs.git
    pkgs.curl
    pkgs.which
    pkgs.gnused
    pkgs.gawk
  ];
  
  env = {
    PATH = "$PATH:${pkgs.nodejs-18_x}/bin:${pkgs.nodePackages.npm}/bin";
    NODE_ENV = "production";
    NPM_CONFIG_FUND = "false";
    NPM_CONFIG_AUDIT = "false";
  };
}

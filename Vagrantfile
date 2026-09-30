Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/jammy64"

  config.vm.define "backend" do |backend|
    backend.vm.hostname = "smartpantry-backend"
    backend.vm.network "private_network", ip: "192.168.56.20"
    backend.vm.provider "virtualbox" do |vb|
      vb.name = "smartpantry-backend"
      vb.memory = 2048
      vb.cpus = 2
    end
    backend.vm.provision "shell", inline: <<~SHELL
      set -euo pipefail
      export DEBIAN_FRONTEND=noninteractive
      apt-get update
      apt-get install -y python3 python3-venv python3-pip git curl ca-certificates

      cd /vagrant/backend
      python3 -m venv .venv
      .venv/bin/pip install --upgrade pip
      .venv/bin/pip install -r requirements.txt
      .venv/bin/python -m app.seed

      cat > /etc/systemd/system/smartpantry-api.service <<'UNIT'
      [Unit]
      Description=SmartPantry FastAPI
      After=network.target
      RequiresMountsFor=/vagrant/backend

      [Service]
      Type=simple
      WorkingDirectory=/vagrant/backend
      Environment=PYTHONUNBUFFERED=1
      ExecStart=/vagrant/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
      Restart=on-failure
      RestartSec=3

      [Install]
      WantedBy=multi-user.target
      UNIT

      systemctl daemon-reload
      systemctl enable --now smartpantry-api.service
    SHELL
  end

  config.vm.define "frontend" do |frontend|
    frontend.vm.hostname = "smartpantry-frontend"
    frontend.vm.network "private_network", ip: "192.168.56.10"
    frontend.vm.provider "virtualbox" do |vb|
      vb.name = "smartpantry-frontend"
      vb.memory = 1024
      vb.cpus = 1
    end
    frontend.vm.provision "shell", inline: <<~SHELL
      set -euo pipefail
      export DEBIAN_FRONTEND=noninteractive
      apt-get update
      apt-get install -y nginx git curl ca-certificates
      install -m 0644 /vagrant/nginx/smartpantry.conf /etc/nginx/sites-available/smartpantry.conf
      ln -sfn /etc/nginx/sites-available/smartpantry.conf /etc/nginx/sites-enabled/smartpantry.conf
      rm -f /etc/nginx/sites-enabled/default
      nginx -t
      systemctl enable --now nginx
      systemctl reload nginx
    SHELL
  end
end
